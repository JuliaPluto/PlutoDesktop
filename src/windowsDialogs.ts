import { Utils } from "electrobun/bun";

export async function chooseNotebookFile() {
  const paths = await Utils.openFileDialog({
    allowedFileTypes: ".jl,.pluto,.plutojl,.nbjl,.pljl,.txt",
    canChooseFiles: true,
    canChooseDirectory: false,
    allowsMultipleSelection: false,
  });

  return paths.find(Boolean) ?? null;
}

export async function chooseSavePath(options: {
  title: string;
  defaultExtension: string;
  filterName: string;
  filterExtensions: string[];
}) {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.Title = ${psString(options.title)}
$dialog.DefaultExt = ${psString(options.defaultExtension)}
$dialog.Filter = ${psString(
    `${options.filterName}|${options.filterExtensions
      .map((extension) => `*.${extension.replace(/^\./, "")}`)
      .join(";")}|All files|*.*`,
  )}
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $dialog.FileName
}
`;

  const proc = Bun.spawn(
    [
      "powershell.exe",
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const stdout = (await new Response(proc.stdout).text()).trim();
  await proc.exited;
  return stdout || null;
}

export async function showError(title: string, message: string) {
  await Utils.showMessageBox({
    type: "error",
    title,
    message,
    buttons: ["OK"],
  });
}

function psString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}
