import React from 'react'
import { Theme } from '@dnb/eufemia/shared'
import inlineScriptProd from '!raw-loader!terser-loader!./inlineScriptProd'
import inlineScriptDev from '!raw-loader!terser-loader!./inlineScriptDev'
import EventEmitter from './EventEmitter.js'

import type { ThemeNames, ThemeProps } from '@dnb/eufemia/shared/Theme'

type PropMapping = string

export type ThemesItem = {
  file?: string
  hide?: boolean
  isDev?: boolean
} & ThemeProps & { name?: ThemeNames }
export type Themes = Array<ThemesItem>

const defaultTheme = globalThis.EUFEMIA_THEME_defaultTheme || 'ui'
const availableThemes = globalThis.EUFEMIA_THEME_themes || []
const storageId = globalThis.EUFEMIA_THEME_storageId || 'eufemia-theme'
const availableThemesArray = Object.keys(availableThemes)

export function getThemes(): Themes {
  return availableThemes
}

export function isValidTheme(themeName: ThemeNames) {
  return availableThemesArray.includes(themeName)
}

export function useThemeHandler(): ThemesItem {
  const [theme, setTheme] = React.useState(getTheme)

  React.useEffect(() => {
    const emitter = EventEmitter.createInstance('themeHandler')
    emitter.listen((theme) => {
      setTheme(theme as ThemesItem)
    })
  }, [])

  return theme
}

export function getTheme(): ThemesItem {
  if (typeof window === 'undefined') {
    return { name: defaultTheme }
  }
  try {
    const data = window.localStorage.getItem(storageId)
    const theme = JSON.parse(
      data?.startsWith('{') ? data : '{}'
    ) as ThemesItem

    const regex = /.*eufemia-theme=([^&]*).*/
    const query = window.location.search
    const fromQuery =
      (regex.test(query) && query?.replace(regex, '$1')) || null

    const themeName = (fromQuery ||
      theme?.name ||
      defaultTheme) as ThemeNames

    if (!isValidTheme(themeName)) {
      console.error('Not valid themeName:', themeName)
      return { name: defaultTheme } // stop here
    }

    return { ...theme, name: themeName }
  } catch (e) {
    console.error(e)
    return { name: defaultTheme }
  }
}

export function setTheme(
  themeProps: { name?: string; propMapping?: PropMapping },
  callback
) {
  const theme = { ...getTheme(), ...themeProps } as ThemesItem

  if (!isValidTheme(theme?.name)) {
    console.error('Not valid themeName:', theme?.name)
    return // stop here
  }

  try {
    globalThis.__updateEufemiaThemeFile(theme.name, true, () => {
      const emitter = EventEmitter.createInstance('themeHandler')
      emitter.update(theme)

      callback?.(theme)
    })

    window.localStorage.setItem(storageId, JSON.stringify(theme))
  } catch (e) {
    console.error(e)
  }
}

let cachedHeadComponents = []
export const onPreRenderHTML = (
  { getHeadComponents, replaceHeadComponents },
  pluginOptions
) => {
  let headComponents = getHeadComponents()

  const isDev = process.env.NODE_ENV !== 'production'

  // Make themes to not be embedded, but rather load as css files
  if (!isDev) {
    let defaultElement
    for (const element of headComponents) {
      const href = element.props['data-href']
      if (href && href.includes('.css')) {
        if (
          availableThemesArray.some((name) => {
            return href.includes(`/${name}.`)
          })
        ) {
          const themeName = (href.match(/\/([^.]*)\./) || [])?.[1]

          // Collect all theme CSS file paths
          if (availableThemes[themeName]) {
            availableThemes[themeName].file = href

            // Store the default inline styles,
            // and place it below data-href="/commons.*.css"
            if (
              pluginOptions?.inlineDefaultTheme &&
              themeName === defaultTheme
            ) {
              defaultElement = element
              headComponents[element] = null
            } else {
              // Remove the inline style
              // but not when its the default theme
              delete element.props['data-href']
              delete element.props['data-identity']
              delete element.props.dangerouslySetInnerHTML
            }
          }
        }
      }
    }

    headComponents.push(defaultElement)
  } else {
    for (const key in availableThemes) {
      availableThemes[key].isDev = true
      availableThemes[key].file = `/${key}.css` // during dev, we get this file from the Webpack cache (not in /public)
    }
  }

  /**
   * We cache the result of the first page,
   * and re-use on all other pages.
   */
  if (cachedHeadComponents?.length) {
    headComponents.push(...cachedHeadComponents)
    replaceComponents(headComponents)
    return // stop here
  }

  cachedHeadComponents = []

  cachedHeadComponents.push(
    <link
      id="eufemia-style-theme"
      key="theme-style"
      rel="stylesheet"
      type="text/css"
      as="style"
    />
  )

  const replaceGlobalVars = (code) => {
    return code
      .replace(/globalThis.isDev/g, JSON.stringify(isDev))
      .replace(/globalThis.defaultTheme/g, JSON.stringify(defaultTheme))
      .replace(/globalThis.storageId/g, JSON.stringify(storageId))
      .replace(
        /globalThis.availableThemes/g,
        JSON.stringify(availableThemes)
      )
      .replace(
        /globalThis.inlineDefaultTheme/g,
        JSON.stringify(pluginOptions?.inlineDefaultTheme)
      )
  }

  /**
   * NB: The dev script needs to be placed before the prod!
   */
  if (isDev) {
    cachedHeadComponents.push(
      <script
        key="eufemia-style-theme-script-dev"
        dangerouslySetInnerHTML={{
          __html: replaceGlobalVars(inlineScriptDev),
        }}
      />
    )
  }

  cachedHeadComponents.push(
    <script
      key="eufemia-style-theme-script-prod"
      dangerouslySetInnerHTML={{
        __html: replaceGlobalVars(inlineScriptProd),
      }}
    />
  )

  if (!pluginOptions?.inlineDefaultTheme) {
    cachedHeadComponents.push(
      <noscript key="theme-style-fallback">
        <link
          id="eufemia-style-theme-fallback"
          rel="stylesheet"
          type="text/css"
          as="style"
          href={availableThemes[defaultTheme].file}
        />
      </noscript>
    )
  }

  headComponents.push(...cachedHeadComponents)

  replaceComponents(headComponents)

  function replaceComponents(headComponents) {
    const uniqueHeadComponents = []

    // Remove duplications
    headComponents.forEach((item) => {
      const exists = uniqueHeadComponents.some((i) => {
        const href = i?.props?.['data-href']
        return href && item?.props?.['data-href'] === href
      })
      if (!exists) {
        uniqueHeadComponents.push(item)
      }
    })

    replaceHeadComponents(uniqueHeadComponents)
  }
}

export function ThemeProvider({ children }) {
  const theme = useThemeHandler()

  return <Theme {...theme}>{children}</Theme>
}

export function wrapRootElement({ element }, pluginOptions) {
  if (pluginOptions?.wrapWithThemeProvider) {
    return <ThemeProvider>{element}</ThemeProvider>
  }

  return element
}
