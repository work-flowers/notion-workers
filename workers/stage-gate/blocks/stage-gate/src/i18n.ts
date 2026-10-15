/**
 * English / Vietnamese display strings.
 *
 * Record labels resolve in this order in Vietnamese mode:
 *   1. the row's own `Item (VI)` / `Description (VI)` property (AI autofill,
 *      or a person's correction),
 *   2. the built-in translation below, for the 16 stock items only,
 *   3. the English text as written.
 * So novel items and edited titles are covered by the Notion properties, and
 * the dictionary is only a fallback while autofill hasn't run yet.
 *
 * **Display only.** Everything written to Notion stays in English — status,
 * select and phase option names must match the bound properties exactly, and
 * seeded item titles are the canonical English names. Translation happens at
 * render time, keyed by option name or `Item key`, so switching language never
 * touches data and two viewers can use different languages on the same page.
 *
 * The Vietnamese is a first draft and needs review by a native speaker at the
 * client before it goes in front of factory users.
 */

import { CHECKLIST, FINAL_PHASE, PHASES, PROJECT_NOUN, STATUS } from "./checklist.ts"

export type Lang = "en" | "vi"
export const LANGS: readonly Lang[] = ["en", "vi"]

/** Checklist labels per language, keyed by `Item key`. English comes from `checklist.ts`. */
const ITEMS_VI: Record<string, { item: string; description: string }> = {
	baseline_weights: {
		item: "Trọng lượng ban đầu",
		description: "Tổng trọng lượng, tải trọng trục và tải trọng từng bánh ghi nhận khi tiếp nhận",
	},
	vehicle_condition_report: {
		item: "Báo cáo tình trạng xe (VCR)",
		description: "Kiểm tra ngoại quan, kiểm tra bảng táp-lô và các hư hỏng có sẵn",
	},
	teardown_sequence_log: {
		item: "Nhật ký trình tự tháo dỡ",
		description: "Ghi chú và hình ảnh từng bước tháo thùng xe nguyên bản (OEM)",
	},
	sensor_location_map: {
		item: "Sơ đồ vị trí cảm biến",
		description: "Chiều cao, góc nghiêng và góc lệch nguyên bản của cảm biến điểm mù, radar và cảm biến lùi",
	},
	electrical_pin_out_sheet: {
		item: "Bảng sơ đồ chân điện",
		description: "Lập sơ đồ màu dây, loại giắc cắm và logic tín hiệu",
	},
	"3d_scan_data": {
		item: "Dữ liệu quét 3D",
		description: "Lưới 3D đã xử lý của khung gầm, vách sau cabin và các điểm cứng chính",
	},
	bemm_compliance_audit: {
		item: "Đánh giá tuân thủ BEMM/BBG",
		description: "Phiếu phê duyệt về góc nạp nhiên liệu, tải điện, khoảng hở và khả năng bảo dưỡng",
	},
	production_master_cad: {
		item: "Bộ CAD gốc cho sản xuất",
		description: "Tệp CAD cuối cùng đã khóa để đưa vào sản xuất",
	},
	master_assembly_record: {
		item: "Hồ sơ lắp ráp mẫu",
		description: "Hình ảnh lắp ráp theo trình tự và ghi chú hướng dẫn từng bước",
	},
	tool_torque_spec_list: {
		item: "Danh mục dụng cụ & lực siết",
		description: "Dụng cụ cần thiết và lực siết cụ thể cho tất cả các chi tiết bắt chặt quan trọng",
	},
	final_bom_fit_kit: {
		item: "BOM cuối cùng & danh mục bộ lắp đặt",
		description: "Danh mục vật tư (BOM) đầy đủ và danh sách phụ kiện bộ lắp đặt đã kiểm tra trọng lượng",
	},
	road_test_nvh_report: {
		item: "Báo cáo chạy thử & NVH",
		description: "Phê duyệt chạy tốc độ cao trên cao tốc, thử trên đường gồ ghề và đặc tính vận hành",
	},
	adas_diagnostic_signoff: {
		item: "Phê duyệt ADAS & chẩn đoán",
		description: "Bằng chứng hiệu chuẩn/kiểm tra ADAS và kết quả quét chẩn đoán OBD-II không lỗi",
	},
	final_weight_compliance: {
		item: "Dữ liệu trọng lượng & tuân thủ cuối cùng",
		description: "Trọng lượng không tải cuối cùng, tải trọng trục và tính toán biển thông số tuân thủ",
	},
	headlight_angle_confirmation: {
		item: "Xác nhận góc đèn pha",
		description: "Kiểm tra độ cao chùm sáng đèn pha theo yêu cầu BEMM",
	},
	wheel_alignment_confirmation: {
		item: "Xác nhận cân chỉnh bánh xe",
		description: "Kiểm tra cân chỉnh bánh xe theo yêu cầu BEMM",
	},
}

/** Short phase labels, by position in `PHASES`. */
const PHASE_SHORT_VI = ["Tiếp nhận", "Tháo dỡ", "Số hóa", "Thiết kế", "Lắp mẫu & kiểm định"]
const PHASE_FULL_VI = ["Tiếp nhận", "Tháo dỡ", "Số hóa", "Thiết kế", "Lắp ráp mẫu & kiểm định"]

const FORMATS_VI: Record<string, string> = {
	Spreadsheet: "Bảng tính",
	"PDF/Images": "PDF/Hình ảnh",
	Document: "Tài liệu",
	"STL/STEP": "STL/STEP",
	"Signed PDF": "PDF đã ký",
	"CAD Archive": "Bộ lưu trữ CAD",
	"Signed Document": "Tài liệu đã ký",
}

const STATUS_VI: Record<string, string> = {
	[STATUS.pending]: "Chưa xong",
	[STATUS.complete]: "Hoàn thành",
	[STATUS.na]: "N/A",
}

const NOUN_VI = "nền tảng xe"

const en = {
	langName: "English",
	stageGate: "Stage gate",
	allProjects: "All projects",
	projectCount: (n: number) => `${n} ${n === 1 ? "project" : "projects"}`,
	readyCount: (n: number) => `${n} ready to advance`,
	loading: "Loading…",
	setupTitle: "Finish setting up this block.",
	truncated:
		"Deliverables has more than 999 rows; some items may not show and new checklists won't be created automatically.",
	dismiss: "Dismiss",
	couldntUpdate: (item: string, message: string) => `Couldn't update “${item}”: ${message}`,
	couldntMove: (phase: string, message: string) => `Couldn't move the project to ${phase}: ${message}`,
	noProjectsYet: `No ${PROJECT_NOUN}s yet. Create the first one above.`,
	projectsByPhase: "Projects by phase",
	noPhase: "No phase",
	openProject: (name: string, phase: string) => `Open ${name}, ${phase}`,
	noChecklistYet: "No checklist yet",
	gateShort: (done: number, total: number) => `Gate ${done}/${total}`,
	handoverShort: (done: number, total: number) => `Handover pack ${done}/${total}`,
	readyToAdvance: "Ready to advance",
	completeTag: "✓ Complete",
	thisPage: "This page",
	none: "None",
	newProject: `New ${PROJECT_NOUN}`,
	creatingOpens: "Creating… it opens when it's ready.",
	couldntCreate: (message: string) => `Couldn't create it: ${message}`,
	projectName: `${PROJECT_NOUN[0].toUpperCase()}${PROJECT_NOUN.slice(1)} name`,
	make: "Make",
	model: "Model",
	variant: "Variant",
	variantPlaceholder: "Variant, e.g. Dual cab · 4x4",
	create: "Create",
	creating: "Creating…",
	cancel: "Cancel",
	startsIn: (phase: string) => `Starts in ${phase}; its checklist is created when you open it.`,
	back: "‹ All projects",
	gateLabel: (phase: string) => `${phase} gate`,
	handoverPack: "Handover pack",
	unknownPhase: (phase: string) => `“${phase}” isn't one of this checklist's phases, so no gate applies.`,
	noPhaseSet: "This project has no phase set.",
	otherItems: "Other items",
	handedOverNote: "✓ Handed over",
	allDone: "Every mandatory item in this phase is complete.",
	noMandatory: "No mandatory items in this phase.",
	stillOpen: (n: number) => `${n} mandatory ${n === 1 ? "item" : "items"} still open in this phase.`,
	moving: "Moving…",
	handOver: "Hand over",
	advanceTo: (phase: string) => `Advance to ${phase}`,
	phases: "Phases",
	current: "Current",
	reopened: "Reopened",
	noItems: "No items",
	optional: "Optional",
	noFileLink: "No file link",
	completedOn: (date: string) => `Completed ${date}`,
	linkPlaceholder: "Paste the file link (SharePoint, server folder, PDM)",
	linkFor: (item: string) => `File link for ${item}`,
	saveAndComplete: "Save & complete",
	save: "Save",
	linkRequired: "A file link is required to mark this item Complete.",
	needsLink: "Add a file link before marking this item Complete.",
	cantRemoveLink: "A Complete item needs a file link. Set it back to Pending first to remove the link.",
	file: "File",
	edit: "Edit",
	addLink: "+ Add file link",
	statusOf: (item: string) => `Status of ${item}`,
	needsLinkTitle: "Needs a file link",
	creatingChecklist: (done: number, total: number) => `Creating the checklist… ${done}/${total}`,
	createdChecklist: (n: number) => `Created ${n} checklist items. Loading them…`,
	noDeliverables: "This project has no deliverables yet.",
	createChecklist: "Create checklist",
	language: "Language",
	owner: "Owner",
	ownerOf: (item: string) => `Owner of ${item}`,
	unassigned: "Unassigned",
	unknownPerson: "Unknown person",
}

export type Strings = typeof en

const vi: Strings = {
	langName: "Tiếng Việt",
	stageGate: "Kiểm soát giai đoạn",
	allProjects: "Tất cả dự án",
	projectCount: (n) => `${n} dự án`,
	readyCount: (n) => `${n} sẵn sàng chuyển giai đoạn`,
	loading: "Đang tải…",
	setupTitle: "Vui lòng hoàn tất thiết lập khối này.",
	truncated:
		"Danh sách hạng mục có hơn 999 dòng; một số hạng mục có thể không hiển thị và danh mục mới sẽ không được tạo tự động.",
	dismiss: "Đóng",
	couldntUpdate: (item, message) => `Không thể cập nhật “${item}”: ${message}`,
	couldntMove: (phase, message) => `Không thể chuyển dự án sang ${phase}: ${message}`,
	noProjectsYet: `Chưa có ${NOUN_VI} nào. Hãy tạo ${NOUN_VI} đầu tiên ở trên.`,
	projectsByPhase: "Dự án theo giai đoạn",
	noPhase: "Chưa có giai đoạn",
	openProject: (name, phase) => `Mở ${name}, ${phase}`,
	noChecklistYet: "Chưa có danh mục",
	gateShort: (done, total) => `Cổng ${done}/${total}`,
	handoverShort: (done, total) => `Hồ sơ bàn giao ${done}/${total}`,
	readyToAdvance: "Sẵn sàng chuyển giai đoạn",
	completeTag: "✓ Hoàn tất",
	thisPage: "Trang này",
	none: "Không có",
	newProject: `Thêm ${NOUN_VI}`,
	creatingOpens: "Đang tạo… sẽ tự mở khi sẵn sàng.",
	couldntCreate: (message) => `Không thể tạo: ${message}`,
	projectName: `Tên ${NOUN_VI}`,
	make: "Hãng xe",
	model: "Mẫu xe",
	variant: "Phiên bản",
	variantPlaceholder: "Phiên bản, ví dụ: Cabin kép · 4x4",
	create: "Tạo",
	creating: "Đang tạo…",
	cancel: "Hủy",
	startsIn: (phase) => `Bắt đầu ở ${phase}; danh mục được tạo khi bạn mở dự án.`,
	back: "‹ Tất cả dự án",
	gateLabel: (phase) => `Cổng ${phase}`,
	handoverPack: "Hồ sơ bàn giao",
	unknownPhase: (phase) => `“${phase}” không thuộc các giai đoạn của danh mục này, nên không áp dụng cổng kiểm soát.`,
	noPhaseSet: "Dự án này chưa có giai đoạn.",
	otherItems: "Hạng mục khác",
	handedOverNote: "✓ Đã bàn giao",
	allDone: "Tất cả hạng mục bắt buộc của giai đoạn này đã hoàn thành.",
	noMandatory: "Giai đoạn này không có hạng mục bắt buộc.",
	stillOpen: (n) => `Còn ${n} hạng mục bắt buộc chưa xong trong giai đoạn này.`,
	moving: "Đang chuyển…",
	handOver: "Bàn giao",
	advanceTo: (phase) => `Chuyển sang ${phase}`,
	phases: "Các giai đoạn",
	current: "Hiện tại",
	reopened: "Mở lại",
	noItems: "Không có hạng mục",
	optional: "Không bắt buộc",
	noFileLink: "Chưa có liên kết tệp",
	completedOn: (date) => `Hoàn thành ${date}`,
	linkPlaceholder: "Dán liên kết tệp (SharePoint, thư mục máy chủ, PDM)",
	linkFor: (item) => `Liên kết tệp cho ${item}`,
	saveAndComplete: "Lưu & hoàn thành",
	save: "Lưu",
	linkRequired: "Cần có liên kết tệp để đánh dấu hạng mục này là Hoàn thành.",
	needsLink: "Hãy thêm liên kết tệp trước khi đánh dấu hạng mục là Hoàn thành.",
	cantRemoveLink:
		"Hạng mục đã Hoàn thành phải có liên kết tệp. Hãy chuyển về Chưa xong trước khi xóa liên kết.",
	file: "Tệp",
	edit: "Sửa",
	addLink: "+ Thêm liên kết tệp",
	statusOf: (item) => `Trạng thái của ${item}`,
	needsLinkTitle: "Cần liên kết tệp",
	creatingChecklist: (done, total) => `Đang tạo danh mục… ${done}/${total}`,
	createdChecklist: (n) => `Đã tạo ${n} hạng mục. Đang tải…`,
	noDeliverables: "Dự án này chưa có hạng mục nào.",
	createChecklist: "Tạo danh mục",
	language: "Ngôn ngữ",
	owner: "Phụ trách",
	ownerOf: (item: string) => `Người phụ trách ${item}`,
	unassigned: "Chưa phân công",
	unknownPerson: "Người dùng không xác định",
}

export const STRINGS: Record<Lang, Strings> = { en, vi }

/** Translator for data labels that live in Notion in English. */
export function labels(lang: Lang) {
	const phaseIdx = (name: string | null) => PHASES.findIndex((p) => p.name === name)
	return {
		/** Full phase name, e.g. "Phase 2 · Teardown" / "Giai đoạn 2 · Tháo dỡ". Unknown names pass through. */
		phase(name: string | null): string {
			if (name === null) return STRINGS[lang].noPhase
			if (name === FINAL_PHASE) return lang === "vi" ? "Đã bàn giao" : FINAL_PHASE
			const i = phaseIdx(name)
			if (i === -1 || lang === "en") return name
			return `Giai đoạn ${i + 1} · ${PHASE_FULL_VI[i]}`
		},
		/** Short phase label for the stepper, board columns and buttons. */
		phaseShort(name: string): string {
			if (name === FINAL_PHASE) return lang === "vi" ? "Đã bàn giao" : FINAL_PHASE
			const i = phaseIdx(name)
			if (i === -1) return name
			return lang === "vi" ? PHASE_SHORT_VI[i] : PHASES[i].short
		},
		/**
		 * An item's title. Translated by `Item key` only while the row still
		 * carries the checklist's own English title, so a title someone edited in
		 * Notion is shown as they wrote it rather than overwritten by the stock one.
		 */
		item(key: string | null, title: string, stored: string | null = null): string {
			if (lang === "en") return title
			if (stored) return stored
			if (key === null) return title
			const stock = CHECKLIST.find((c) => c.key === key)
			return stock && stock.item === title ? (ITEMS_VI[key]?.item ?? title) : title
		},
		description(key: string | null, text: string, stored: string | null = null): string {
			if (lang === "en") return text
			if (stored) return stored
			if (key === null) return text
			const stock = CHECKLIST.find((c) => c.key === key)
			return stock && stock.description === text ? (ITEMS_VI[key]?.description ?? text) : text
		},
		format(name: string): string {
			return lang === "vi" ? (FORMATS_VI[name] ?? name) : name
		},
		status(name: string): string {
			return lang === "vi" ? (STATUS_VI[name] ?? name) : name
		},
		date(day: string): string {
			const [y, m, d] = day.split("-").map(Number)
			return new Date(y, m - 1, d).toLocaleDateString(lang === "vi" ? "vi-VN" : undefined, {
				day: "numeric",
				month: "short",
				year: "numeric",
			})
		},
	}
}

export type Labels = ReturnType<typeof labels>

const STORAGE_KEY = "stage-gate.lang"

/** The viewer's saved choice, else their browser language. Storage can be unavailable in the sandbox. */
export function initialLang(): Lang {
	try {
		const saved = window.localStorage.getItem(STORAGE_KEY)
		if (saved === "en" || saved === "vi") return saved
	} catch {
		// Storage blocked; fall through.
	}
	return navigator.language?.toLowerCase().startsWith("vi") ? "vi" : "en"
}

export function saveLang(lang: Lang): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, lang)
	} catch {
		// Not persisted; the toggle still works for this session.
	}
}
