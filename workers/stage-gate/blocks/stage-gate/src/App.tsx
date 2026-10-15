import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"

import { FINAL_PHASE, PHASES, STATUS, STATUS_ORDER, type ItemStatus } from "./checklist.ts"
import {
	applyChange,
	buildPhases,
	deliverablesFor,
	gate,
	missingEvidence,
	missingItems,
	normaliseLink,
	phaseIndex,
	sameId,
	sameIds,
	shouldSeed,
	type Deliverable,
	type ItemChange,
	type PhaseView,
	type Project,
} from "./gate.ts"
import { initialLang, labels, LANGS, saveLang, STRINGS, type Labels, type Lang, type Strings } from "./i18n.ts"
import { today, type Person, type ProjectDetails, type Store } from "./store.ts"

/** The owner picker's choices; `bound` is false when Owner isn't mapped, which hides the picker. */
const People = createContext<{ people: Person[]; bound: boolean }>({ people: [], bound: false })

/** UI strings (`t`) and data-label translator (`l`) for the viewer's language. */
const I18n = createContext<{ lang: Lang; t: Strings; l: Labels }>({ lang: "en", t: STRINGS.en, l: labels("en") })
const useI18n = () => useContext(I18n)

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
	return (
		<div className="sg-lang" role="group" aria-label={STRINGS[lang].language}>
			{LANGS.map((code) => (
				<button
					key={code}
					type="button"
					className="sg-lang-btn"
					aria-pressed={lang === code}
					lang={code}
					title={STRINGS[code].langName}
					onClick={() => onChange(code)}
				>
					{code.toUpperCase()}
				</button>
			))}
		</div>
	)
}

type ItemOverride = Pick<Deliverable, "status" | "completedDate" | "fileLink" | "ownerIds">

type Seed =
	| { projectId: string; state: "running"; created: number; total: number }
	| { projectId: string; state: "done"; total: number }
	| { projectId: string; state: "error"; message: string }

export function App({ store, contextProjectId }: { store: Store; contextProjectId: string | null }) {
	const [lang, setLangState] = useState<Lang>(initialLang)
	const i18n = useMemo(() => ({ lang, t: STRINGS[lang], l: labels(lang) }), [lang])
	const { t, l } = i18n
	const peopleCtx = useMemo(() => ({ people: store.people, bound: store.ownerBound }), [store.people, store.ownerBound])
	function setLang(next: Lang) {
		setLangState(next)
		saveLang(next)
	}
	// The overview comes first; a project opens only when picked from it.
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const baseProject = store.projects.find((p) => sameId(p.id, selectedId ?? "")) ?? null
	// A just-created project is opened as soon as the data source delivers its row.
	const [creatingId, setCreatingId] = useState<string | null>(null)
	useEffect(() => {
		if (creatingId && store.projects.some((p) => sameId(p.id, creatingId))) {
			setSelectedId(creatingId)
			setCreatingId(null)
		}
	}, [creatingId, store.projects])

	async function createProject(name: string, details: ProjectDetails): Promise<string | null> {
		setError(null)
		const result = await store.createProject(name, details)
		if (!result.ok) return result.message
		setCreatingId(result.id)
		return null
	}

	// Optimistic state: shown immediately, dropped once the store agrees.
	const [statusOv, setStatusOv] = useState<Record<string, ItemOverride>>({})
	const [phaseOv, setPhaseOv] = useState<Record<string, string>>({})
	const [saving, setSaving] = useState<ReadonlySet<string>>(new Set())
	const [error, setError] = useState<string | null>(null)
	const [advancing, setAdvancing] = useState(false)
	const [seed, setSeed] = useState<Seed | null>(null)
	const seeded = useRef(new Set<string>())

	useEffect(() => {
		setStatusOv((ov) => {
			const next = { ...ov }
			let changed = false
			for (const [id, o] of Object.entries(ov)) {
				const row = store.deliverables.find((d) => d.id === id)
				if (row && row.status === o.status && row.fileLink === o.fileLink && sameIds(row.ownerIds, o.ownerIds)) {
					delete next[id]
					changed = true
				}
			}
			return changed ? next : ov
		})
		setPhaseOv((ov) => {
			const next = { ...ov }
			let changed = false
			for (const [id, phase] of Object.entries(ov)) {
				if (store.projects.find((p) => p.id === id)?.phase === phase) {
					delete next[id]
					changed = true
				}
			}
			return changed ? next : ov
		})
	}, [store.deliverables, store.projects])

	const project: Project | null = baseProject
		? { ...baseProject, phase: phaseOv[baseProject.id] ?? baseProject.phase }
		: null

	const items = useMemo(
		() =>
			project
				? deliverablesFor(project.id, store.deliverables).map((d) =>
						statusOv[d.id] ? { ...d, ...statusOv[d.id] } : d,
					)
				: [],
		[project?.id, store.deliverables, statusOv],
	)

	// Seed the checklist once for a project with no deliverables at all.
	useEffect(() => {
		if (!baseProject) return
		const ok = shouldSeed({
			project: baseProject,
			rows: store.deliverables,
			loading: store.loading,
			truncated: store.truncated,
			alreadyAttempted: seeded.current.has(baseProject.id),
		})
		if (!ok || store.bindingProblems.length > 0) return
		void runSeed(baseProject)
	}, [baseProject?.id, store.loading, store.truncated, store.deliverables.length])

	async function runSeed(p: Project) {
		seeded.current.add(p.id)
		const todo = missingItems(deliverablesFor(p.id, store.deliverables))
		if (todo.length === 0) return
		setSeed({ projectId: p.id, state: "running", created: 0, total: todo.length })
		const result = await store.createItems(p, todo, (created) =>
			setSeed({ projectId: p.id, state: "running", created, total: todo.length }),
		)
		setSeed(
			result.ok
				? { projectId: p.id, state: "done", total: todo.length }
				: { projectId: p.id, state: "error", message: result.message },
		)
	}

	/** Returns an error message, or null once saved. */
	async function updateItem(item: Deliverable, change: ItemChange): Promise<string | null> {
		const applied = applyChange(item, change, today())
		if (!applied.ok) return t.needsLink
		const { next } = applied
		if (next.status === item.status && next.fileLink === item.fileLink && sameIds(next.ownerIds, item.ownerIds)) {
			return null
		}
		setError(null)
		setStatusOv((ov) => ({
			...ov,
			[item.id]: {
				status: next.status,
				completedDate: next.completedDate,
				fileLink: next.fileLink,
				ownerIds: next.ownerIds,
			},
		}))
		setSaving((s) => new Set(s).add(item.id))
		const result = await store.updateItem(item, next)
		setSaving((s) => {
			const next = new Set(s)
			next.delete(item.id)
			return next
		})
		if (!result.ok) {
			setStatusOv(({ [item.id]: _dropped, ...rest }) => rest)
			setError(t.couldntUpdate(l.item(item.key, item.item), result.message))
			return result.message
		}
		return null
	}

	async function advance(p: Project, to: string) {
		setError(null)
		setAdvancing(true)
		setPhaseOv((ov) => ({ ...ov, [p.id]: to }))
		const result = await store.setPhase(p, to)
		setAdvancing(false)
		if (!result.ok) {
			setPhaseOv(({ [p.id]: _dropped, ...rest }) => rest)
			setError(t.couldntMove(l.phase(to), result.message))
		}
	}

	if (store.loading && store.projects.length === 0) {
		return <div className="sg-empty">{t.loading}</div>
	}

	// Overview rows reflect optimistic edits too, so going back shows what was just done.
	const overviewProjects = store.projects.map((p) => ({ ...p, phase: phaseOv[p.id] ?? p.phase }))
	const overviewItems = store.deliverables.map((d) => (statusOv[d.id] ? { ...d, ...statusOv[d.id] } : d))

	return (
		<I18n.Provider value={i18n}>
		<People.Provider value={peopleCtx}>
		<div className="sg" lang={lang}>
			<div className="sg-topbar">
				<LangToggle lang={lang} onChange={setLang} />
			</div>
			{store.bindingProblems.length > 0 && (
				<div className="sg-banner sg-banner--warn" role="status">
					<strong>{t.setupTitle}</strong>
					<ul>
						{store.bindingProblems.map((p) => (
							<li key={p}>{p}</li>
						))}
					</ul>
				</div>
			)}
			{store.truncated && (
				<div className="sg-banner sg-banner--warn" role="status">
					{t.truncated}
				</div>
			)}
			{error && (
				<div className="sg-banner sg-banner--error" role="alert">
					{error}
					<button type="button" className="sg-link" onClick={() => setError(null)}>
						{t.dismiss}
					</button>
				</div>
			)}
			{project ? (
				<GateView
					onBack={() => setSelectedId(null)}
					project={project}
					items={items}
					saving={saving}
					advancing={advancing}
					seed={seed?.projectId === project.id ? seed : null}
					onUpdate={updateItem}
					onAdvance={(to) => advance(project, to)}
					onSeed={() => runSeed(project)}
				/>
			) : (
				<Overview
					projects={overviewProjects}
					deliverables={overviewItems}
					contextProjectId={contextProjectId}
					onOpen={setSelectedId}
					onCreate={createProject}
					waitingForNew={creatingId !== null}
				/>
			)}
		</div>
		</People.Provider>
		</I18n.Provider>
	)
}

function Overview(props: {
	projects: Project[]
	deliverables: Deliverable[]
	contextProjectId: string | null
	onOpen: (id: string) => void
	onCreate: (name: string, details: ProjectDetails) => Promise<string | null>
	waitingForNew: boolean
}) {
	const { t, l } = useI18n()
	const cards = props.projects
		.map((p) => {
			const items = deliverablesFor(p.id, props.deliverables)
			return { project: p, items, gate: gate(p.phase, items), index: phaseIndex(p.phase) }
		})
		.sort((a, b) => a.project.name.localeCompare(b.project.name))

	// One column per phase plus Handed over; projects whose phase the checklist
	// doesn't know get an extra column rather than disappearing.
	const columns = [
		...PHASES.map((p, i) => ({
			key: p.name,
			title: `${i + 1} · ${l.phaseShort(p.name)}`,
			cards: cards.filter((c) => c.index === i),
		})),
		{ key: FINAL_PHASE, title: l.phaseShort(FINAL_PHASE), cards: cards.filter((c) => c.index === PHASES.length) },
	]
	const unknown = cards.filter((c) => c.index === null)
	if (unknown.length > 0) columns.push({ key: "__none", title: t.noPhase, cards: unknown })
	const ready = cards.filter((c) => c.gate.canAdvance).length

	return (
		<section className="sg-card">
			<header className="sg-head">
				<div>
					<div className="sg-eyebrow">{t.stageGate}</div>
					<h2 className="sg-title">{t.allProjects}</h2>
					<div className="sg-phase-now">
						{t.projectCount(cards.length)}
						{ready > 0 && ` · ${t.readyCount(ready)}`}
					</div>
				</div>
				<NewProject onCreate={props.onCreate} waiting={props.waitingForNew} />
			</header>
			{cards.length === 0 && (
				<div className="sg-empty">{t.noProjectsYet}</div>
			)}
			<div className="sg-board" role="list" aria-label={t.projectsByPhase}>
				{columns.map((col) => (
					<section key={col.key} className="sg-col" role="listitem" aria-label={col.title}>
						<header className="sg-col-head">
							<span className="sg-col-title">{col.title}</span>
							<span className="sg-col-count">{col.cards.length}</span>
						</header>
						<div className="sg-col-cards">
							{col.cards.map(({ project, items, gate: g }) => {
								const here = props.contextProjectId !== null && sameId(project.id, props.contextProjectId)
								const handedOver = project.phase === FINAL_PHASE
								return (
									<button
										key={project.id}
										type="button"
										className="sg-kcard"
										aria-label={t.openProject(project.name, l.phase(project.phase))}
										onClick={() => props.onOpen(project.id)}
									>
										<span className="sg-kcard-name">{project.name}</span>
										{items.length === 0 ? (
											<span className="sg-ov-note">{t.noChecklistYet}</span>
										) : (
											<>
												{g.current && (
													<span className="sg-kcard-gate">
														<span className={g.current.ready ? "sg-ov-good" : undefined}>
															{t.gateShort(g.current.mandatoryDone, g.current.mandatoryTotal)}
														</span>
														<Meter done={g.current.mandatoryDone} total={g.current.mandatoryTotal} />
													</span>
												)}
												<span className="sg-kcard-pack">
													{t.handoverShort(g.handover.done, g.handover.total)}
												</span>
											</>
										)}
										{(here || g.canAdvance || handedOver) && (
											<span className="sg-kcard-tags">
												{g.canAdvance && <span className="sg-tag sg-tag--good">{t.readyToAdvance}</span>}
												{handedOver && <span className="sg-tag sg-tag--good">{t.completeTag}</span>}
												{here && <span className="sg-tag">{t.thisPage}</span>}
											</span>
										)}
									</button>
								)
							})}
							{col.cards.length === 0 && <div className="sg-col-empty">{t.none}</div>}
						</div>
					</section>
				))}
			</div>
		</section>
	)
}

const NO_DETAILS: ProjectDetails = { make: "", model: "", variant: "" }

function NewProject(props: {
	onCreate: (name: string, details: ProjectDetails) => Promise<string | null>
	waiting: boolean
}) {
	const [open, setOpen] = useState(false)
	const [name, setName] = useState("")
	const [details, setDetails] = useState<ProjectDetails>(NO_DETAILS)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const { t, l } = useI18n()
	const label = t.newProject

	if (props.waiting) return <span className="sg-hint">{t.creatingOpens}</span>

	if (!open) {
		return (
			<button type="button" className="sg-button" onClick={() => setOpen(true)}>
				+ {label}
			</button>
		)
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault()
		const trimmed = name.trim()
		if (!trimmed) return
		setBusy(true)
		setError(null)
		const message = await props.onCreate(trimmed, details)
		setBusy(false)
		if (message) {
			setError(t.couldntCreate(message))
			return
		}
		setName("")
		setDetails(NO_DETAILS)
		setOpen(false)
	}

	const field = (key: keyof ProjectDetails, label: string, placeholder: string) => (
		<input
			className="sg-input sg-input--small"
			placeholder={placeholder}
			aria-label={label}
			value={details[key]}
			disabled={busy}
			onChange={(e) => setDetails((d) => ({ ...d, [key]: e.target.value }))}
		/>
	)

	return (
		<form
			className="sg-new"
			onSubmit={submit}
			onKeyDown={(e) => {
				if (e.key === "Escape") setOpen(false)
			}}
		>
			<input
				className="sg-input"
				autoFocus
				placeholder={t.projectName}
				aria-label={t.projectName}
				value={name}
				disabled={busy}
				onChange={(e) => setName(e.target.value)}
			/>
			<div className="sg-new-details">
				{field("make", t.make, t.make)}
				{field("model", t.model, t.model)}
				{field("variant", t.variant, t.variantPlaceholder)}
			</div>
			<button type="submit" className="sg-button" disabled={busy || name.trim() === ""}>
				{busy ? t.creating : t.create}
			</button>
			<button type="button" className="sg-link" onClick={() => setOpen(false)} disabled={busy}>
				{t.cancel}
			</button>
			{error && <span className="sg-new-error">{error}</span>}
			<span className="sg-new-note">{t.startsIn(l.phase(PHASES[0].name))}</span>
		</form>
	)
}

function Meter({ done, total }: { done: number; total: number }) {
	const pct = total === 0 ? 0 : Math.round((done / total) * 100)
	return (
		<span className="sg-meter" aria-hidden>
			<span className="sg-meter-fill" style={{ width: `${pct}%` }} />
		</span>
	)
}

function GateView(props: {
	onBack: () => void
	project: Project
	items: Deliverable[]
	saving: ReadonlySet<string>
	advancing: boolean
	seed: Seed | null
	onUpdate: (item: Deliverable, change: ItemChange) => Promise<string | null>
	onAdvance: (to: string) => void
	onSeed: () => void
}) {
	const { project, items, seed } = props
	const { t, l } = useI18n()
	const { phases, unphased } = buildPhases(project.phase, items)
	const g = gate(project.phase, items)
	const index = phaseIndex(project.phase)
	const handedOver = project.phase === FINAL_PHASE

	const back = (
		<button type="button" className="sg-back" onClick={props.onBack}>
			{t.back}
		</button>
	)

	if (items.length === 0) {
		return (
			<section className="sg-card">
				{back}
				<Header project={project} />
				<SeedState seed={seed} onSeed={props.onSeed} />
			</section>
		)
	}

	const open = g.current ? g.current.mandatoryTotal - g.current.mandatoryDone : 0

	return (
		<section className="sg-card">
			{back}
			<Header project={project}>
				<div className="sg-stats">
					{g.current && (
						<Stat
							label={t.gateLabel(l.phaseShort(g.current.phase.name))}
							value={`${g.current.mandatoryDone}/${g.current.mandatoryTotal}`}
							good={g.current.ready}
						/>
					)}
					<Stat
						label={t.handoverPack}
						value={`${g.handover.done}/${g.handover.total}`}
						good={g.handover.done === g.handover.total}
					/>
				</div>
			</Header>

			<Stepper index={index} />

			{index === null && (
				<div className="sg-banner sg-banner--warn">
					{project.phase
						? t.unknownPhase(project.phase)
						: t.noPhaseSet}
				</div>
			)}

			<div className="sg-phases">
				{phases.map((p) => (
					<PhaseSection
						key={`${project.id}:${project.phase}:${p.index}`}
						view={p}
						saving={props.saving}
						onUpdate={props.onUpdate}
					/>
				))}
				{unphased.length > 0 && (
					<div className="sg-phase sg-phase--future">
						<div className="sg-phase-head">
							<span className="sg-phase-title">{t.otherItems}</span>
						</div>
						<ul className="sg-items">
							{unphased.map((d) => (
								<ItemRow key={d.id} item={d} saving={props.saving.has(d.id)} onUpdate={props.onUpdate} />
							))}
						</ul>
					</div>
				)}
			</div>

			<footer className="sg-footer">
				{handedOver ? (
					<span className="sg-done-note">{t.handedOverNote}</span>
				) : g.next ? (
					<>
						<span className="sg-hint">
							{g.canAdvance
								? g.current && g.current.mandatoryTotal > 0
									? t.allDone
									: t.noMandatory
								: t.stillOpen(open)}
						</span>
						<button
							type="button"
							className="sg-button"
							disabled={!g.canAdvance || props.advancing}
							onClick={() => g.next && props.onAdvance(g.next)}
						>
							{props.advancing ? t.moving : g.next === FINAL_PHASE ? t.handOver : t.advanceTo(l.phaseShort(g.next))}
						</button>
					</>
				) : null}
			</footer>
		</section>
	)
}

function Header({ project, children }: { project: Project; children?: React.ReactNode }) {
	const { t, l } = useI18n()
	return (
		<header className="sg-head">
			<div>
				<div className="sg-eyebrow">{t.stageGate}</div>
				<h2 className="sg-title">{project.name}</h2>
				<div className="sg-phase-now">{l.phase(project.phase)}</div>
			</div>
			{children}
		</header>
	)
}

function Stat({ label, value, good }: { label: string; value: string; good: boolean }) {
	return (
		<div className={`sg-stat${good ? " sg-stat--good" : ""}`}>
			<div className="sg-stat-value">{value}</div>
			<div className="sg-stat-label">{label}</div>
		</div>
	)
}

function Stepper({ index }: { index: number | null }) {
	const { t, l } = useI18n()
	const steps = [...PHASES.map((p) => p.name), FINAL_PHASE]
	return (
		<ol className="sg-stepper" aria-label={t.phases}>
			{steps.map((label, i) => {
				const state = index === null ? "future" : i < index ? "done" : i === index ? "current" : "future"
				return (
					<li key={label} className={`sg-step sg-step--${state}`} aria-current={state === "current" ? "step" : undefined}>
						<span className="sg-step-dot">{state === "done" ? "✓" : i < PHASES.length ? i + 1 : "★"}</span>
						<span className="sg-step-label">{l.phaseShort(label)}</span>
					</li>
				)
			})}
		</ol>
	)
}

function PhaseSection(props: {
	view: PhaseView
	saving: ReadonlySet<string>
	onUpdate: (item: Deliverable, change: ItemChange) => Promise<string | null>
}) {
	const { view } = props
	const { t, l } = useI18n()
	const [open, setOpen] = useState(view.state === "current")
	const reopened = view.state === "done" && !view.ready
	return (
		<div className={`sg-phase sg-phase--${view.state}`}>
			<button
				type="button"
				className="sg-phase-head"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
			>
				<span className="sg-chevron" aria-hidden>
					{open ? "▾" : "▸"}
				</span>
				<span className="sg-phase-mark" aria-hidden>
					{view.state === "done" && !reopened ? "✓" : ""}
				</span>
				<span className="sg-phase-title">{l.phase(view.phase.name)}</span>
				{view.state === "current" && <span className="sg-tag">{t.current}</span>}
				{reopened && <span className="sg-tag sg-tag--warn">{t.reopened}</span>}
				<span className="sg-phase-count">
					{view.items.length === 0
						? t.noItems
						: `${view.mandatoryDone}/${view.mandatoryTotal}`}
				</span>
			</button>
			{open && view.items.length > 0 && (
				<ul className="sg-items">
					{view.items.map((d) => (
						<ItemRow key={d.id} item={d} saving={props.saving.has(d.id)} onUpdate={props.onUpdate} />
					))}
				</ul>
			)}
		</div>
	)
}

function ItemRow(props: {
	item: Deliverable
	saving: boolean
	onUpdate: (item: Deliverable, change: ItemChange) => Promise<string | null>
}) {
	const { item } = props
	const { t, l } = useI18n()
	const title = l.item(item.key, item.item)
	const done = item.status === STATUS.complete || item.status === STATUS.na
	// "complete": the editor was opened by clicking Complete without a link.
	const [editing, setEditing] = useState<null | "edit" | "complete">(null)
	const [draft, setDraft] = useState("")
	const [message, setMessage] = useState<string | null>(null)

	function openEditor(mode: "edit" | "complete") {
		setDraft(item.fileLink ?? "")
		setMessage(null)
		setEditing(mode)
	}

	async function choose(status: ItemStatus) {
		if (status === STATUS.complete && item.fileLink === null) {
			openEditor("complete")
			return
		}
		const error = await props.onUpdate(item, { status })
		setMessage(error)
	}

	async function setOwner(ownerIds: string[]) {
		setMessage(await props.onUpdate(item, { ownerIds }))
	}

	async function saveLink(e: React.FormEvent) {
		e.preventDefault()
		const change: ItemChange =
			editing === "complete" ? { status: STATUS.complete, fileLink: draft } : { fileLink: draft }
		const error = await props.onUpdate(item, change)
		if (error) {
			setMessage(
				item.status === STATUS.complete && normaliseLink(draft) === null
					? t.cantRemoveLink
					: error,
			)
			return
		}
		setEditing(null)
		setMessage(null)
	}

	return (
		<li className={`sg-item${done ? " sg-item--done" : ""}`}>
			<div className="sg-item-main">
				<div className="sg-item-title">
					{title}
					{!item.mandatory && <span className="sg-tag">{t.optional}</span>}
					{missingEvidence(item) && <span className="sg-tag sg-tag--warn">{t.noFileLink}</span>}
				</div>
				{item.description && <div className="sg-item-desc">{l.description(item.key, item.description)}</div>}
				<div className="sg-item-meta">
					<OwnerPicker item={item} saving={props.saving} onChange={(ownerIds) => setOwner(ownerIds)} />
					{item.format && <span>{l.format(item.format)}</span>}
					{item.status === STATUS.complete && item.completedDate && (
						<span>{t.completedOn(l.date(item.completedDate))}</span>
					)}
				</div>
				{editing ? (
					<form className="sg-link-form" onSubmit={saveLink}>
						<input
							className="sg-input sg-input--small"
							autoFocus
							placeholder={t.linkPlaceholder}
							aria-label={t.linkFor(title)}
							value={draft}
							disabled={props.saving}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Escape") setEditing(null)
							}}
						/>
						<button
							type="submit"
							className="sg-button sg-button--small"
							disabled={props.saving || (editing === "complete" && normaliseLink(draft) === null)}
						>
							{editing === "complete" ? t.saveAndComplete : t.save}
						</button>
						<button type="button" className="sg-link" onClick={() => setEditing(null)}>
							{t.cancel}
						</button>
						{editing === "complete" && !message && (
							<span className="sg-link-hint">{t.linkRequired}</span>
						)}
					</form>
				) : (
					<div className="sg-file">
						{item.fileLink ? (
							<>
								<span className="sg-file-label">{t.file}</span>
								<span className="sg-file-url" title={item.fileLink}>
									{item.fileLink}
								</span>
								<button type="button" className="sg-link" onClick={() => openEditor("edit")}>
									{t.edit}
								</button>
							</>
						) : (
							<button type="button" className="sg-link sg-link--muted" onClick={() => openEditor("edit")}>
								{t.addLink}
							</button>
						)}
					</div>
				)}
				{message && <div className="sg-item-error">{message}</div>}
			</div>
			<div className="sg-seg" role="group" aria-label={t.statusOf(title)}>
				{STATUS_ORDER.map((s) => (
					<button
						key={s}
						type="button"
						className={`sg-seg-btn sg-seg-btn--${s === STATUS.na ? "na" : s.toLowerCase()}`}
						aria-pressed={item.status === s}
						disabled={props.saving}
						title={s === STATUS.complete && item.fileLink === null ? t.needsLinkTitle : undefined}
						onClick={() => choose(s)}
					>
						{l.status(s)}
					</button>
				))}
			</div>
		</li>
	)
}

/**
 * One owner per item. A row that already holds several people (set in Notion)
 * shows them all and keeps them until someone picks a single owner here.
 */
function OwnerPicker(props: { item: Deliverable; saving: boolean; onChange: (ownerIds: string[]) => void }) {
	const { people, bound } = useContext(People)
	const { t, l } = useI18n()
	if (!bound) return null
	const { ownerIds } = props.item
	const known = new Map(people.map((p) => [p.id.replace(/-/g, ""), p]))
	const nameOf = (id: string) => known.get(id.replace(/-/g, ""))?.name ?? t.unknownPerson
	const multiple = ownerIds.length > 1
	const value = multiple ? "__multiple" : (ownerIds[0] ?? "")
	// Keep an owner the list doesn't include (a guest, or names still loading) selectable as-is.
	const extra = ownerIds.length === 1 && !known.has(ownerIds[0].replace(/-/g, "")) ? ownerIds[0] : null

	return (
		<label className={`sg-owner${ownerIds.length === 0 ? " sg-owner--empty" : ""}`}>
			<span className="sg-owner-label">{t.owner}</span>
			<select
				value={value}
				disabled={props.saving}
				aria-label={t.ownerOf(l.item(props.item.key, props.item.item))}
				onChange={(e) => {
					const id = e.target.value
					if (id === "__multiple") return
					props.onChange(id ? [id] : [])
				}}
			>
				<option value="">{t.unassigned}</option>
				{multiple && (
					<option value="__multiple" disabled>
						{ownerIds.map(nameOf).join(", ")}
					</option>
				)}
				{extra && <option value={extra}>{nameOf(extra)}</option>}
				{people.map((p) => (
					<option key={p.id} value={p.id}>
						{p.name}
					</option>
				))}
			</select>
		</label>
	)
}

function SeedState({ seed, onSeed }: { seed: Seed | null; onSeed: () => void }) {
	const { t } = useI18n()
	if (seed?.state === "running") {
		return (
			<div className="sg-seed">
				<div>{t.creatingChecklist(seed.created, seed.total)}</div>
				<progress max={seed.total} value={seed.created} />
			</div>
		)
	}
	if (seed?.state === "done") {
		return <div className="sg-seed">{t.createdChecklist(seed.total)}</div>
	}
	return (
		<div className="sg-seed">
			{seed?.state === "error" && <div className="sg-banner sg-banner--error">{seed.message}</div>}
			<div>{t.noDeliverables}</div>
			<button type="button" className="sg-button" onClick={onSeed}>
				{t.createChecklist}
			</button>
		</div>
	)
}
