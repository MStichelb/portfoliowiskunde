import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ show: vi.fn(), actions: [] as Array<(state: never, data: FormData) => Promise<unknown>>, sync: vi.fn(), bulk: vi.fn(), note: vi.fn(), response: vi.fn(), deleteResponse: vi.fn(), compare: vi.fn(), switchSource: vi.fn() }));
vi.mock("./flash-toast", () => ({ useToast: () => hooks.show }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: (action: (state: never, data: FormData) => Promise<unknown>, initial: unknown) => { hooks.actions.push(action); return [initial, action]; },
  useState: (initial: unknown) => [initial, vi.fn()],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: vi.fn(), useId: () => "feedback", useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useReducer: (_fn: unknown, initial: unknown) => [initial, vi.fn()],
}));
vi.mock("@/app/admin/actions", () => ({ syncSpaceAction: hooks.sync, bulkExercisePublicationAction: hooks.bulk, errorReportThreadNoteAction: hooks.note, saveErrorReportTeacherResponseAction: hooks.response, deleteErrorReportTeacherResponseAction: hooks.deleteResponse, compareSourcesAction: hooks.compare, switchSourceAction: hooks.switchSource, saveExerciseLevelAction: vi.fn(), saveExerciseNoteAction: vi.fn(), deleteExerciseNoteAction: vi.fn(), toggleExerciseVisibilityAction: vi.fn(), toggleExerciseAlternativeVisibilityAction: vi.fn() }));
vi.mock("@/app/student-error-report-actions", () => ({ dismissHandledReportNotificationsAction: vi.fn() }));

import { SyncSpaceForm } from "./sync-space-form";
import { ExerciseBulkTable } from "./exercise-bulk-table";
import { ErrorReportNoteForm } from "./error-report-note-form";
import { ErrorReportResponseButton } from "./error-report-response-button";
import { SourceSwitchPanel } from "./source-switch-panel";
import { ChangelogDrawer } from "./changelog-drawer";
import { AdminLearningSpaceOrderEditor } from "./admin-learning-space-overview";
import { StudentHandledReportNotificationBanner } from "./student-handled-report-notification";
import { MutationFeedbackForm } from "./mutation-feedback-form";
import { dismissHandledReportNotificationsAction } from "@/app/student-error-report-actions";

beforeEach(() => { vi.resetAllMocks(); hooks.actions = []; });
const submit = async (index = 0, data = new FormData()) => hooks.actions[index]({ error: null, successCount: 0 } as never, data);
function nodes(value: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...nodes(value.props.children)];
}

describe("feedback at the active action callers", () => {
  it("silently dismisses a student notification and reports dismissal failure", async () => {
    const tree = StudentHandledReportNotificationBanner({ notification: { reportIds: ["report"], count: 1, exerciseCode: "1", exerciseLabelSingular: "Oefening", singleLearningSpaceId: "space" } });
    const element = nodes(tree).find((node) => node.type === MutationFeedbackForm)!;
    const form = MutationFeedbackForm(element.props as Parameters<typeof MutationFeedbackForm>[0]);
    await form.props.action(new FormData());
    expect(hooks.show).not.toHaveBeenCalled();
    vi.mocked(dismissHandledReportNotificationsAction).mockRejectedValueOnce(new Error("SQL secret"));
    await form.props.action(new FormData());
    expect(hooks.show).toHaveBeenCalledExactlyOnceWith({ type: "error", message: "De wijziging kon niet worden opgeslagen. Probeer opnieuw." });
  });
  it("confirms sync and reports its technical failure while preserving the conflict dialog", async () => {
    SyncSpaceForm({ learningSpaceId: "space" });
    hooks.sync.mockResolvedValueOnce({ error: null, success: true });
    await submit();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "success", message: "Synchronisatie voltooid." });
    hooks.sync.mockResolvedValueOnce({ error: "Synchroniseren is niet gelukt." });
    await submit();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "error", message: "Synchroniseren is niet gelukt." });
    hooks.show.mockClear();
    hooks.sync.mockResolvedValueOnce({ error: "Oefeningscode 3b komt meerdere keren voor binnen portfolio 1B: a en b" });
    await submit();
    expect(hooks.show).not.toHaveBeenCalled();
  });
  it("confirms a bulk operation and reports an operational rejection", async () => {
    ExerciseBulkTable({ portfolioId: "portfolio", learningSpaceId: "space", sections: [] });
    hooks.bulk.mockResolvedValueOnce({ error: null }); await submit();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "success", message: "Bulkbewerking opgeslagen." });
    hooks.bulk.mockResolvedValueOnce({ error: "Ongeldige oefeningselectie." }); await submit();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "error", message: "Ongeldige oefeningselectie." });
  });
  it("confirms admin-note save, reports storage failure and leaves text validation inline", async () => {
    ErrorReportNoteForm({ threadId: "thread", note: "" });
    hooks.note.mockResolvedValueOnce({ error: null, successCount: 1 }); await submit();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "success", message: "Adminnotitie opgeslagen." });
    hooks.note.mockResolvedValueOnce({ error: "Opslaan mislukt.", technical: true, successCount: 0 }); await submit();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "error", message: "Opslaan mislukt." });
    hooks.show.mockClear();
    hooks.note.mockResolvedValueOnce({ error: "Maximaal 4000 tekens.", successCount: 0 }); await submit();
    expect(hooks.show).not.toHaveBeenCalled();
  });
  it("confirms response save/save-and-finish/delete, with separate validation and storage feedback", async () => {
    ErrorReportResponseButton({ reportId: "report", exerciseCode: "1", locationLabel: "Bundel", reporterLabel: "Leerling", teacherResponse: null });
    hooks.response.mockResolvedValue({ error: null, successCount: 1 }); await submit();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "success", message: "Bericht opgeslagen." });
    const data = new FormData(); data.set("markHandled", "true"); await submit(0, data);
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "success", message: "Bericht opgeslagen en melding afgewerkt." });
    hooks.deleteResponse.mockResolvedValueOnce({ error: null, successCount: 1 }); await submit(1);
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "success", message: "Bericht verwijderd." });
    hooks.response.mockResolvedValueOnce({ error: "Gebruik maximaal 500 tekens platte tekst.", successCount: 0 });
    hooks.show.mockClear(); await submit(); expect(hooks.show).not.toHaveBeenCalled();
    hooks.deleteResponse.mockResolvedValueOnce({ error: "Verwijderen mislukt.", technical: true, successCount: 0 }); await submit(1);
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "error", message: "Verwijderen mislukt." });
  });
  it("toasts technical compare/switch errors while preserving source configuration feedback", async () => {
    SourceSwitchPanel({ space: { sources: [] } as unknown as Parameters<typeof SourceSwitchPanel>[0]["space"] });
    hooks.compare.mockResolvedValueOnce({ error: "Controleer de bronconfiguratie.", technical: false });
    await submit(); expect(hooks.show).not.toHaveBeenCalled();
    hooks.compare.mockResolvedValueOnce({ error: "Vergelijken mislukt.", technical: true }); await submit();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "error", message: "Vergelijken mislukt." });
    hooks.switchSource.mockResolvedValueOnce({ error: "Omschakelen mislukt.", technical: true }); await submit(1);
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "error", message: "Omschakelen mislukt." });
  });
  it("reports changelog read failure without closing the drawer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    const tree = ChangelogDrawer({ entries: [], hasUnread: true });
    const trigger = nodes(tree).find((node) => node.props.className === "site-nav-icon changelog-trigger")!;
    await (trigger.props.onClick as () => Promise<void>)();
    expect(hooks.show).toHaveBeenCalledWith({ type: "error", message: expect.stringContaining("leesstatus") });
    vi.unstubAllGlobals();
  });
  it("confirms explicit personal-order save and keeps its editor on failure", async () => {
    const action = vi.fn(async () => undefined), close = vi.fn();
    const tree = AdminLearningSpaceOrderEditor({ cards: [], action, onCancel: close });
    const save = nodes(tree).find((node) => node.type === "form")!.props.action as (data: FormData) => Promise<void>;
    await save(new FormData());
    expect(close).toHaveBeenCalledOnce();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "success", message: "Persoonlijke volgorde opgeslagen." });
    close.mockClear(); action.mockRejectedValueOnce(new Error("storage")); await save(new FormData());
    expect(close).not.toHaveBeenCalled();
    expect(hooks.show).toHaveBeenLastCalledWith({ type: "error", message: expect.stringContaining("niet worden opgeslagen") });
  });
});
