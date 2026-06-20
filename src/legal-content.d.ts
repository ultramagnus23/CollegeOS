// Vite raw-import of markdown legal documents as strings.
declare module '*.md?raw' {
  const content: string;
  export default content;
}
