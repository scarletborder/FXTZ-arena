let editingProfileId = "default";

export function setEditingProfileId(profileId: string): void {
  editingProfileId = profileId || "default";
}

export function getEditingProfileId(): string {
  return editingProfileId;
}
