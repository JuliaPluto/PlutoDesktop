export default Pluto;

declare namespace Pluto {
  type PlutoURL = {
    url: string;
    port: string;
    secret: string;
  };

  type RunPlutoResponse = 'loading' | 'updating' | 'no_update' | PlutoURL;
}
