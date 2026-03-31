import JSZip from 'jszip';
import { compileRuntime, type DialogueProject } from './dialogue';

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(',');
  const encoded = parts[1] ?? '';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export async function buildRuntimeZip(project: DialogueProject): Promise<Blob> {
  const zip = new JSZip();
  const runtime = compileRuntime(project);

  zip.file(`${project.sceneId}.json`, JSON.stringify(runtime, null, 2));

  const referencedAssetIds = new Set<string>();
  Object.values(project.nodes).forEach((node) => {
    if (node.portraits.left && project.assets[node.portraits.left]) {
      referencedAssetIds.add(node.portraits.left);
    }
    if (node.portraits.right && project.assets[node.portraits.right]) {
      referencedAssetIds.add(node.portraits.right);
    }
  });

  referencedAssetIds.forEach((assetId) => {
    const asset = project.assets[assetId];
    if (asset) {
      zip.file(`images/${asset.fileName}`, dataUrlToBytes(asset.dataUrl));
    }
  });

  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(href);
}
