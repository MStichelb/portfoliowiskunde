import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LearningSpace } from "@/lib/repositories";

import { LearningSpaceLifecycleActions } from "./learning-space-lifecycle-actions";

const activeSpace: LearningSpace = {
  id: "space-active",
  name: "Actieve leeromgeving",
  slug: "actief",
  shortLabel: "A",
  sortOrder: 1,
  isActive: true,
  archivedAt: null,
  sourceType: "local",
  localSourcePath: "C:\\bron",
  oneDriveDriveId: null,
  oneDriveFolderId: null,
  oneDriveFolderPath: null,
  googleDriveFolderId: null,
  googleDriveFolderLabel: null,
  sources: [],
  activeSourceId: null,
  primarySource: null,
  mirrorSource: null,
};

describe("LearningSpace lifecycle actions", () => {
  it("renders manage and archive, but no delete, for an active LearningSpace", () => {
    const markup = renderToStaticMarkup(<LearningSpaceLifecycleActions space={activeSpace} />);

    expect(markup).toContain("Beheren");
    expect(markup).toContain("Archiveren");
    expect(markup).not.toContain("Herstellen");
    expect(markup).not.toContain("Verwijderen");
  });

  it("renders manage, restore and delete for an archived LearningSpace", () => {
    const markup = renderToStaticMarkup(<LearningSpaceLifecycleActions space={{ ...activeSpace, isActive: false, archivedAt: "2026-08-14T12:00:00.000Z" }} />);

    expect(markup).toContain("Beheren");
    expect(markup).toContain("Herstellen");
    expect(markup).toContain("Verwijderen");
    expect(markup).not.toContain("Archiveren");
  });
});
