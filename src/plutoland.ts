/**
 * Uploading notebooks to https://pluto.land from the desktop app.
 *
 * This has to run in the main process. The editor page is served from a
 * `file://` URL, so its origin is `null`. That means the renderer cannot:
 *   1. fetch the notebook export from the local Pluto server (cross-origin,
 *      and Pluto only sends CORS headers for *unauthenticated* requests), nor
 *   2. upload to / delete from pluto.land (which only allows the
 *      `https://pluto.land` and `http://localhost` origins, not `null`).
 *
 * Node's `fetch` is not subject to CORS, so we do the upload here and hand the
 * result back to the renderer over IPC.
 */

import { fetchPluto, withSearchParams } from './util.ts';
import { Globals } from './globals.ts';
import { generalLogger } from './logger.ts';

const PLUTOLAND_URL = 'https://pluto.land';

export type PlutoLandResponse = { id: string; creation_secret: string };

/** POST an HTML blob to pluto.land and return the created notebook's id + secret. */
const uploadBlobToPlutoLand = async (
  notebookBlob: Blob,
): Promise<PlutoLandResponse> => {
  const form = new FormData();
  form.append('file0', notebookBlob, 'notebook.html');

  const uploadResponse = await fetch(`${PLUTOLAND_URL}/n`, {
    method: 'POST',
    body: form,
  });
  if (!uploadResponse.ok) {
    throw new Error(`pluto.land upload failed (HTTP ${uploadResponse.status}).`);
  }

  const data = (await uploadResponse.json()) as PlutoLandResponse;
  generalLogger.info('Uploaded notebook to pluto.land:', data.id);
  return data;
};

/**
 * Generate a notebook's static HTML export and upload it to pluto.land.
 *
 * @param notebookId the id of the notebook to upload
 */
export const uploadNotebookToPlutoLand = async (
  notebookId: string,
): Promise<PlutoLandResponse> => {
  // Download the HTML export *without* the offline bundle: it is much smaller,
  // and pluto.land serves the required assets itself.
  const exportResponse = await fetchPluto(
    withSearchParams('notebookexport', {
      secret: Globals.PLUTO_SECRET,
      id: notebookId,
    }),
  );
  if (!exportResponse.ok) {
    throw new Error(
      `Could not generate the notebook export (HTTP ${exportResponse.status}).`,
    );
  }
  return uploadBlobToPlutoLand(await exportResponse.blob());
};

/**
 * Upload pre-generated HTML to pluto.land. Used for recordings, whose HTML is
 * assembled client-side rather than by the server.
 *
 * @param html the full HTML document to upload
 */
export const uploadHtmlToPlutoLand = (
  html: string,
): Promise<PlutoLandResponse> =>
  uploadBlobToPlutoLand(new Blob([html], { type: 'text/html' }));

/**
 * Delete a previously uploaded notebook from pluto.land.
 *
 * @param id the pluto.land id returned by the upload
 * @param creationSecret the creation secret returned by the upload
 */
export const deleteFromPlutoLand = async (
  id: string,
  creationSecret: string,
): Promise<void> => {
  const response = await fetch(`${PLUTOLAND_URL}/n/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      'X-Creation-Secret': creationSecret,
    },
  });
  if (!response.ok) {
    throw new Error(`pluto.land delete failed (HTTP ${response.status}).`);
  }
  generalLogger.info('Deleted notebook from pluto.land:', id);
};
