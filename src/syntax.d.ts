declare module 'syntax' {
  interface SyntaxOptions {
    language: string
    cssPrefix?: string
  }
  export default class Syntax {
    constructor(options: SyntaxOptions)
    richtext(text: string): this
    html(): string
    markup(): Record<string, unknown>
  }
}
