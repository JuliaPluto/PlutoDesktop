/**
 * It is not possible to 'open' an already open notebook i.e.
 * a notebook that has not been shutdown by Pluto.
 *
 * This manager manages the currently
 * open notebooks and gives us ids of already open notebooks
 * so that we can directly go to the **edit** url.
 */
class NotebookManager {
  private fileToId: Map<string, string> = new Map<string, string>();

  private idToFile: Map<string, string> = new Map<string, string>();

  constructor(data: Record<string, string>) {
    Object.keys(data).forEach((k) => this.add(data[k], k));
    this.printData();
  }

  remove = (filePath: string) => {
    if (this.fileToId.has(filePath)) {
      this.fileToId.delete(filePath);
    }
  };

  add = (file: string, id: string) => {
    this.fileToId.set(file, id);
    this.idToFile.set(id, file);
  };

  hasFile = (file: string) => this.fileToId.has(file);

  getId = (file: string) => this.fileToId.get(file);

  hasId = (id: string) => this.idToFile.has(id);

  getFile = (id: string) => this.idToFile.get(id);

  printData = () => {
    console.log('Current NotebookManager Status');
    const tableData: TableRow[] = [];
    this.fileToId.forEach((value, key) => tableData.push({ key, value }));
    console.table(tableData);
  };
}

export default NotebookManager;
