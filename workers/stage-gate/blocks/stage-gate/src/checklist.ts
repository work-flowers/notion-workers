/**
 * The checklist the block enforces — the one thing to replace per client.
 *
 * Hard-coded for the demo, from the "R&D Phase Check List" sheet of the
 * handover workbook. Kept as plain data with no React or SDK imports so it
 * can later be read from a Checklist Definition database instead (with
 * per-language labels) without touching the gate logic.
 *
 * Phase names must match the bound properties' option names exactly: the
 * project's Phase status and the deliverable's Phase select.
 */

export type PhaseDef = {
	/** Option name on both Phase properties. */
	name: string
	/** Short label for the stepper. */
	short: string
}

export const PHASES: readonly PhaseDef[] = [
	{ name: "Phase 1 · Intake", short: "Intake" },
	{ name: "Phase 2 · Teardown", short: "Teardown" },
	{ name: "Phase 3 · Digital", short: "Digital" },
	{ name: "Phase 4 · Design", short: "Design" },
	{ name: "Phase 5 · Master build & validation", short: "Build & validation" },
]

/** What one project is called in this client's language, for buttons and prompts. */
export const PROJECT_NOUN = "vehicle platform"

/** The project Phase option after the last gated phase. */
export const FINAL_PHASE = "Handed over"

export type ChecklistItem = {
	key: string
	order: number
	item: string
	phase: string
	category: string
	description: string
	format: string
	mandatory: boolean
}

const P1 = PHASES[0].name
const P2 = PHASES[1].name
const P3 = PHASES[2].name
const P4 = PHASES[3].name
const P5 = PHASES[4].name

export const CHECKLIST: readonly ChecklistItem[] = [
	{ key: "baseline_weights", order: 1, item: "Baseline Weights", phase: P1, category: "Intake", format: "Spreadsheet", mandatory: true, description: "Total, Axle, and Corner weights recorded at intake" },
	{ key: "vehicle_condition_report", order: 2, item: "Vehicle Condition Report (VCR)", phase: P1, category: "Intake", format: "PDF/Images", mandatory: true, description: "Visual inspection, dash audit, and pre-existing damage" },
	{ key: "teardown_sequence_log", order: 3, item: "Teardown Sequence Log", phase: P2, category: "Teardown", format: "Document", mandatory: true, description: "Step-by-step notes and photos of OEM tub removal" },
	{ key: "sensor_location_map", order: 4, item: "Sensor Location Map", phase: P2, category: "Teardown", format: "Spreadsheet", mandatory: true, description: "Factory heights, pitch, and yaw for BSM, radar, and reverse sensors" },
	{ key: "electrical_pin_out_sheet", order: 5, item: "Electrical Pin-Out Sheet", phase: P2, category: "Teardown", format: "Spreadsheet", mandatory: true, description: "Wire colors, plug types, and signal logic mapped" },
	{ key: "3d_scan_data", order: 6, item: "3D Scan Data", phase: P3, category: "Digital", format: "STL/STEP", mandatory: true, description: "Cleaned 3D mesh of chassis, cab-back, and key hard points" },
	{ key: "bemm_compliance_audit", order: 7, item: "BEMM/BBG Compliance Audit", phase: P4, category: "Design", format: "Signed PDF", mandatory: true, description: "Sign-off sheet for fuel angle, electrical load, clearances, and serviceability" },
	{ key: "production_master_cad", order: 8, item: "Production Master CAD Files", phase: P4, category: "Design", format: "CAD Archive", mandatory: true, description: "Final locked CAD files for manufacturing" },
	{ key: "master_assembly_record", order: 9, item: "Master Assembly Record", phase: P5, category: "Master Build", format: "Document", mandatory: true, description: "Sequential build photos and step-by-step instructional notes" },
	{ key: "tool_torque_spec_list", order: 10, item: "Tool & Torque Specification List", phase: P5, category: "Master Build", format: "Spreadsheet", mandatory: true, description: "Required tools and specific torque settings for all critical fasteners" },
	{ key: "final_bom_fit_kit", order: 11, item: "Final BOM & Fit-Kit Manifest", phase: P5, category: "Master Build", format: "Spreadsheet", mandatory: true, description: "Complete Bill of Materials and weight-checked Fit-Kit hardware list" },
	{ key: "road_test_nvh_report", order: 12, item: "Road Test & NVH Report", phase: P5, category: "Validation", format: "Signed Document", mandatory: true, description: "Sign-off on highway speed runs, corrugation test, and handling dynamics" },
	{ key: "adas_diagnostic_signoff", order: 13, item: "ADAS & Diagnostic Sign-Off", phase: P5, category: "Validation", format: "Signed Document", mandatory: true, description: "Proof of ADAS calibration/testing and clean OBD-II diagnostic scan" },
	{ key: "final_weight_compliance", order: 14, item: "Final Weight & Compliance Data", phase: P5, category: "Validation", format: "Spreadsheet", mandatory: true, description: "Final Tare weight, axle loads, and compliance plate calculations" },
	{ key: "headlight_angle_confirmation", order: 15, item: "Headlight Angle Confirmation", phase: P5, category: "Validation", format: "Spreadsheet", mandatory: true, description: "Perform a headlight level check against the BEMM requirements" },
	{ key: "wheel_alignment_confirmation", order: 16, item: "Wheel Alignment Confirmation", phase: P5, category: "Validation", format: "Spreadsheet", mandatory: true, description: "Perform a wheel alignment check against the BEMM requirements" },
]

/** Status option names on the Deliverables Status property. */
export const STATUS = {
	pending: "Pending",
	complete: "Complete",
	na: "N/A",
} as const

export type ItemStatus = (typeof STATUS)[keyof typeof STATUS]
export const STATUS_ORDER: readonly ItemStatus[] = [STATUS.pending, STATUS.complete, STATUS.na]
