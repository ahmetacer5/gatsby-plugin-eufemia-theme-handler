/**
 * Gatsby Node setup
 *
 */

import path from 'path'
import micromatch from 'micromatch'
import { slash } from 'gatsby-core-utils'
import { createThemesImport } from './collectThemes'

global.themeNames = []

exports.pluginOptionsSchema = ({ Joi }) => {
  return Joi.object({
    themes: Joi.object().required(),
    defaultTheme: Joi.string().required(),
    storageId: Joi.string().optional().default('eufemia-theme'),
    filesGlobs: Joi.array()
      .optional()
      .default([
        '**/style/dnb-ui-core.min.css',
        '**/style/themes/**/*-theme-{basis,components,extensions}.min.css',
      ]),
    includeFiles: Joi.array().optional().default([
      // The file order does matter!
      '**/dnb-ui-core.*',
      '**/*-theme-extensions.*',
      '**/*-theme-components.*',
      '**/*-theme-basis.*',
    ]),
    inlineDefaultTheme: Joi.boolean().optional().default(true),
    wrapWithThemeProvider: Joi.boolean().optional().default(true),
    coreStyleName: Joi.string().optional().default('dnb-ui-core'),
    omitScrollBehavior: Joi.boolean().optional().default(false),
    verbose: Joi.boolean().optional().default(false),
  })
}

exports.onPreBootstrap = ({ reporter, store }, pluginOptions) => {
  const state = store.getState()
  const programDirectory = state.program.directory

  // ensure to run this after the main app has run onPreInit
  createThemesImport({ reporter, programDirectory, pluginOptions })
}

exports.onPostBuild = ({ reporter }) => {
  if (global.themeNames.length > 0) {
    reporter.success(
      `Eufemia themes successfully extracted: ${global.themeNames.join(
        ', '
      )}`
    )
  } else {
    reporter.warn('No Eufemia themes found!')
  }
}

exports.onCreateWebpackConfig = (
  { stage, actions, plugins, getConfig },
  pluginOptions
) => {
  const config = getConfig()

  config.plugins.push(
    plugins.define({
      'globalThis.EUFEMIA_THEME_defaultTheme': JSON.stringify(
        pluginOptions.defaultTheme
      ),
      'globalThis.EUFEMIA_THEME_themes': JSON.stringify(
        pluginOptions.themes
      ),
      'globalThis.EUFEMIA_THEME_storageId': JSON.stringify(
        pluginOptions.storageId
      ),
    })
  )

  if (stage === 'develop' || stage === 'build-javascript') {
    const isInGlob = (fileName) => {
      return pluginOptions.filesGlobs.some((glob) =>
        micromatch.isMatch(fileName, path.dirname(glob))
      )
    }

    config.optimization.splitChunks.cacheGroups.styles = {
      ...config.optimization.splitChunks.cacheGroups.styles,
      name(module) {
        const fileName = slash(module.context)
        if (isInGlob(fileName)) {
          const moduleName = fileName.match(/\/.*theme-([^/]*)$/)?.[1]

          if (moduleName && !global.themeNames.includes(moduleName)) {
            global.themeNames.push(moduleName)
          }

          return moduleName || 'commons'
        }

        return 'commons'
      },
    }
  }

  actions.replaceWebpackConfig(config)
}
