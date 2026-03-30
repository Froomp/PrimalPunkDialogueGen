import { projectSchema, type AssetEntry, type DialogueProject } from './dialogue';

export const AUTOSAVE_KEY = 'primal-punk-dialogue-editor.project';

export function loadProjectFromStorage(): DialogueProject | null {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) {
    return null;
  }

  return projectSchema.parse(JSON.parse(raw));
}

export function downloadProjectFile(project: DialogueProject): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${project.sceneId}.project.json`;
  link.click();
  URL.revokeObjectURL(href);
}

export async function fileToAsset(file: File): Promise<AssetEntry> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  return {
    id: file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataUrl
  };
}

export async function readProjectFile(file: File): Promise<DialogueProject> {
  const text = await file.text();
  return projectSchema.parse(JSON.parse(text));
}
