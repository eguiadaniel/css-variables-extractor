export {};

declare global {
  interface Window {
    extractedData: {
      mainCss: { info: {}; variables: any[] };
      defaultCss: { info: {}; variables: any[] };
      currentStory: { info: {}; variables: any[] };
    };
    currentVariables: { [key: string]: string };
  }
}
