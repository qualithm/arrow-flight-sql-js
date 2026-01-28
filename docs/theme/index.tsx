import { createRequire } from "node:module"

import type { Application, Options, PageEvent, Reflection } from "typedoc"
import { DefaultTheme, DefaultThemeRenderContext, JSX, RendererEvent } from "typedoc"

const require = createRequire(import.meta.url)

/**
 * Tailwind CSS configuration matching the Qualithm app design system
 */
const tailwindConfig = `
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        zinc: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
        blue: {
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
        },
      },
    },
  },
}
`

/**
 * Qualithm custom theme for TypeDoc
 * Extends the default theme with Qualithm branding and Tailwind CSS
 */
export class QualithmTheme extends DefaultTheme {
  private _contextCache?: QualithmThemeContext

  override getRenderContext(pageEvent: PageEvent<Reflection>): QualithmThemeContext {
    this._contextCache ||= new QualithmThemeContext(this, pageEvent, this.application.options)
    return this._contextCache
  }
}

/**
 * Custom render context with Qualithm branding
 */
class QualithmThemeContext extends DefaultThemeRenderContext {
  constructor(theme: DefaultTheme, page: PageEvent<Reflection>, options: Options) {
    super(theme, page, options)
  }

  /**
   * Override the default header to add Qualithm branding with Tailwind classes
   */
  override header = (props: PageEvent<Reflection>): JSX.Element => {
    return (
      <header class="tsd-page-toolbar">
        <div class="tsd-toolbar-contents container">
          <div class="table-cell" id="tsd-search" data-base={this.relativeURL("./")}>
            <div class="field">
              <label
                for="tsd-search-field"
                class="tsd-widget tsd-toolbar-icon search no-hierarchal"
              >
                {this.icons.search()}
              </label>
              <input type="text" id="tsd-search-field" aria-label="Search" />
            </div>
            <div class="field">
              <div id="tsd-toolbar-links">
                {Object.entries(this.options.getValue("navigationLinks")).map(([label, url]) => (
                  <a href={url}>{label}</a>
                ))}
              </div>
            </div>
            <ul class="results">
              <li class="state loading">Preparing search index...</li>
              <li class="state failure">The search index is not available</li>
            </ul>
            <a href={this.relativeURL("index.html")} class="title">
              {props.project.name}
            </a>
          </div>
          <div class="table-cell" id="tsd-widgets">
            <a
              href="#"
              class="tsd-widget tsd-toolbar-icon menu no-hierarchal"
              data-toggle="menu"
              aria-label="Menu"
            >
              {this.icons.menu()}
            </a>
          </div>
        </div>
      </header>
    )
  }

  /**
   * Override footer to add Qualithm attribution
   */
  override footer = (): JSX.Element => {
    return (
      <footer>
        <p class="tsd-generator">
          Built by{" "}
          <a href="https://qualithm.com" target="_blank" rel="noopener noreferrer">
            Qualithm
          </a>{" "}
          • Generated using{" "}
          <a href="https://typedoc.org/" target="_blank" rel="noopener noreferrer">
            TypeDoc
          </a>
        </p>
      </footer>
    )
  }
}

/**
 * Plugin entry point - called by TypeDoc
 * Injects Tailwind CSS into all generated HTML files
 */
export function load(app: Application): void {
  app.renderer.defineTheme("qualithm", QualithmTheme)

  // After all pages are rendered, inject Tailwind into each HTML file
  app.renderer.on(RendererEvent.END, (event: RendererEvent) => {
    const outputDir = event.outputDirectory
    const fs = require("node:fs")
    const path = require("node:path")

    // Script to inject into <head>
    const tailwindScript = `
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      ${tailwindConfig}
    </script>
`

    function processDir(dir: string) {
      const files = fs.readdirSync(dir)
      for (const file of files) {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          processDir(filePath)
        } else if (file.endsWith(".html")) {
          let content = fs.readFileSync(filePath, "utf-8")
          // Inject after <head>
          content = content.replace("<head>", "<head>" + tailwindScript)
          fs.writeFileSync(filePath, content)
        }
      }
    }

    processDir(outputDir)
    app.logger.info("Injected Tailwind CSS into all HTML files")
  })
}
