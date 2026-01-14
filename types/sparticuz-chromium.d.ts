declare module "@sparticuz/chromium" {
  const chromium: {
    args: string[];
    headless: boolean;
    executablePath: () => Promise<string>;
  };

  export default chromium;
}



