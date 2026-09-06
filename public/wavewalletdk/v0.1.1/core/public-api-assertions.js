import { EntryFailureCodeFailed, EntryKindSend, EntryPhaseSettling, EntryRequestTypeLightning, EntryStatusPending, ExitInfeasibilityReasonUneconomical, ExitJobStatusPending, ExitPathUnilateral, FACADE_METHODS, isExitInfeasibilityFundable, ListViewActivity, SendQuoteStatusComplete, SendRailLightning, } from "./index.js";
const method = FACADE_METHODS[0];
const activityOptions = { kinds: [EntryKindSend], cursor: 0 };
const acknowledgement = 'I_KNOW_WHAT_I_AM_DOING';
const subsystemDebugConfig = { debugLevel: 'ROND=debug,info' };
const pickerDebugLevel = 'info';
// @ts-expect-error subsystem expressions are runtime config, not picker levels.
const subsystemPickerLevel = 'ROND=debug,info';
void method;
void activityOptions;
void acknowledgement;
void subsystemDebugConfig;
void pickerDebugLevel;
void subsystemPickerLevel;
void [
    EntryFailureCodeFailed,
    EntryPhaseSettling,
    EntryRequestTypeLightning,
    EntryStatusPending,
    ExitInfeasibilityReasonUneconomical,
    ExitJobStatusPending,
    ExitPathUnilateral,
    ListViewActivity,
    SendQuoteStatusComplete,
    SendRailLightning,
];
void null;
void null;
void null;
void null;
void null;
void null;
void null;
void null;
void null;
void null;
const _fundable = isExitInfeasibilityFundable;
void _fundable;
void null;
void null;
void null;
void null;
