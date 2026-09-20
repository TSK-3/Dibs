// Metro asset module declarations for file types TypeScript doesn't know about.
declare module '*.gguf' {
  const asset: number;
  export default asset;
}
