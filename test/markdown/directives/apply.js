import { load } from 'cheerio'
import dedent from 'dedent'
import MarkdownIt from 'markdown-it'
import { comment } from '../../../src/markdown/comment'
import applyDirectives from '../../../src/markdown/directives/apply'
import parseDirectives from '../../../src/markdown/directives/parse'
import { slide } from '../../../src/markdown/slide'

describe('Marpit directives apply plugin', () => {
  const themeSetStub = new Map()
  themeSetStub.set('test_theme', true)

  const md = (...args) => {
    const customDirectives = { global: {}, local: {} }
    const instance = new MarkdownIt('commonmark')

    instance.marpit = {
      customDirectives,
      options: { looseYAML: false },
      themeSet: themeSetStub,
    }

    return instance
      .use(comment)
      .use(slide)
      .use(parseDirectives)
      .use(applyDirectives, ...args)
  }

  const mdForTest = (...args) =>
    md(...args).use((mdInstance) => {
      mdInstance.core.ruler.before(
        'marpit_directives_apply',
        'marpit_directives_apply_test',
        (state) => {
          state.tokens.forEach((token) => {
            if (token.meta && token.meta.marpitDirectives) {
              // Internal directive
              token.meta.marpitDirectives.unknownDir = 'directive'
            }
          })
        }
      )
    })

  const basicDirs = dedent`
    ---
    class: test
    theme: test_theme
    ---
  `

  const toObjStyle = (style) =>
    (style || '').split(';').reduce((obj, text) => {
      const splited = text.trim().split(':')
      if (splited.length !== 2) return obj

      const [key, val] = splited
      return { ...obj, [key.trim()]: val.trim() }
    }, {})

  it('applies directives to slide node', () => {
    const $ = load(mdForTest().render(basicDirs))
    const section = $('section').first()
    const style = toObjStyle(section.attr('style'))

    expect(section.is('.test')).toBe(true)
    expect(section.attr('data-class')).toBe('test')
    expect(section.attr('data-theme')).toBe('test_theme')
    expect(section.attr('data-unknown-dir')).toBeUndefined()
    expect(style['--class']).toBe('test')
    expect(style['--theme']).toBe('test_theme')
    expect(style['--unknown-dir']).not.toBe('directive')
  })

  context('with dataset option as false', () => {
    const opts = { dataset: false }

    it('does not apply directives to data attributes', () => {
      const $ = load(mdForTest(opts).render(basicDirs))
      const section = $('section').first()

      expect(section.attr('data-class')).toBeUndefined()
      expect(section.attr('data-theme')).toBeUndefined()
    })
  })

  context('with css option as false', () => {
    const opts = { css: false }

    it('does not apply directives to CSS custom properties', () => {
      const $ = load(mdForTest(opts).render(basicDirs))
      const section = $('section').first()

      expect(section.attr('style')).toBeUndefined()
    })
  })

  describe('Local directives', () => {
    describe('Background image', () => {
      const bgDirs = dedent`
        ---
        backgroundColor: white
        backgroundImage: url(//example.com/a.jpg)
        backgroundPosition: left top
        backgroundRepeat: repeat-y
        backgroundSize: 25%
        color: black
        ---
      `

      it('applies corresponding style to section element', () => {
        const $ = load(mdForTest().render(bgDirs))
        const section = $('section').first()
        const style = toObjStyle(section.attr('style'))

        expect(style['background-color']).toBe('white')
        expect(style['background-image']).toBe('url(//example.com/a.jpg)')
        expect(style['background-position']).toBe('left top')
        expect(style['background-repeat']).toBe('repeat-y')
        expect(style['background-size']).toBe('25%')
        expect(style.color).toBe('black')
      })

      context('when directives of image options are not defined', () => {
        const bgDefaultDirs =
          '<!-- backgroundImage: "linear-gradient(to bottom, #fff, #000)" -->'

        it('assigns background image option as default value', () => {
          const $ = load(mdForTest().render(bgDefaultDirs))
          const section = $('section').first()
          const style = toObjStyle(section.attr('style'))

          expect(style['background-position']).toBe('center')
          expect(style['background-repeat']).toBe('no-repeat')
          expect(style['background-size']).toBe('cover')
        })
      })

      context('when backgroundImage directive is not defined', () => {
        const bgOptionDirs = dedent`
          ---
          backgroundPosition: "top"
          backgroundRepeat: "repeat"
          backgroundSize: "150px"
          ---

          # Slide 1

          ---
          <!-- backgroundImage: "url(//example.com/specified.png)" -->

          ## Slide 2

          ---
          <!-- backgroundImage: -->

          ### Slide 3
        `

        it('ignores background option directives', () => {
          const $ = load(mdForTest().render(bgOptionDirs))
          const [styleOne, styleTwo, styleThree] = [
            toObjStyle($('section#1').attr('style')),
            toObjStyle($('section#2').attr('style')),
            toObjStyle($('section#3').attr('style')),
          ]

          expect(styleOne['background-position']).toBeUndefined()
          expect(styleOne['background-repeat']).toBeUndefined()
          expect(styleOne['background-size']).toBeUndefined()
          expect(styleTwo['background-position']).toBe('top')
          expect(styleTwo['background-repeat']).toBe('repeat')
          expect(styleTwo['background-size']).toBe('150px')
          expect(styleThree['background-position']).toBeUndefined()
          expect(styleThree['background-repeat']).toBeUndefined()
          expect(styleThree['background-size']).toBeUndefined()
        })
      })

      context('when directives about images has a style injection', () => {
        const bgInjectionDirs = dedent`
          ---
          backgroundImage: "none;--injection1:injection1"
          backgroundPosition: "left;--injection2:injection2"
          backgroundRepeat: "no-repeat;--injection3:injection3"
          backgroundSize: "auto;--injection4:injection4"
          backgroundColor: "white;--injection5:injection5"
          color: "black;--injection6:injection6"
          ---
        `

        it('sanitizes injected styles', () => {
          const $ = load(mdForTest().render(bgInjectionDirs))
          const section = $('section').first()
          const style = toObjStyle(section.attr('style'))

          expect(style['background-image']).toBe('none')
          expect(style['background-position']).toBe('left')
          expect(style['background-repeat']).toBe('no-repeat')
          expect(style['background-size']).toBe('auto')
          expect(style['background-color']).toBe('white')
          expect(style.color).toBe('black')

          Array.from({ length: 6 }, (v, k) => k + 1).forEach((i) =>
            expect(style[`--injection${i}`]).toBeUndefined()
          )
        })
      })
    })

    describe('Paginate', () => {
      it('applies data-marpit-pagination attribute', () => {
        const paginateDirs = dedent`
          ---
          paginate: true
          _paginate:
          ---

          # Slide 1

          Pagination is not rendered

          ---

          ## Slide 2

          Pagination is rendered (2 of 2)
        `

        const $ = load(mdForTest().render(paginateDirs))
        const sections = $('section')

        expect(sections.eq(0).data('marpit-pagination')).toBeUndefined()
        expect(sections.eq(0).data('marpit-pagination-total')).toBeUndefined()
        expect(sections.eq(1).data('marpit-pagination')).toBe(2)
        expect(sections.eq(1).data('marpit-pagination-total')).toBe(2)
      })
    })

    describe('Paginate with skipped slides', () => {
      it('applies data-marpit-pagination attribute with a _paginate:hold slide', () => {
        const paginateDirs = dedent`
          ---
          paginate: true
          _paginate:
          ---

          # Slide 1

          - Page is counted (1 of 2)
          - Pagination is not rendered

          ---

          <!--
          _paginate: hold
          -->

          ## Slide 2

          - Page is not counted
          - Pagination is rendered (1 of 2)

          ---

          ## Slide 3

          - Page is counted
          - Pagination is rendered (2 of 2)
        `

        const $ = load(mdForTest().render(paginateDirs))
        const sections = $('section')

        expect(sections.eq(0).data('marpit-pagination')).toBeUndefined()
        expect(sections.eq(0).data('marpit-pagination-total')).toBeUndefined()
        expect(sections.eq(1).data('marpit-pagination')).toBe(1)
        expect(sections.eq(1).data('marpit-pagination-total')).toBe(2)
        expect(sections.eq(2).data('marpit-pagination')).toBe(2)
        expect(sections.eq(2).data('marpit-pagination-total')).toBe(2)
      })

      it('applies data-marpit-pagination attribute with a _paginate:skip slide', () => {
        const paginateDirs = dedent`
          ---
          paginate: true
          _paginate:
          ---

          # Slide 1

          - Page is counted (1 of 2)
          - Pagination is not rendered

          ---

          <!--
          _paginate: skip
          -->

          ## Slide 2

          - Page is not counted
          - Pagination is not rendered (1 of 2)

          ---

          ## Slide 3

          - Page is counted
          - Pagination is rendered (2 of 2)
        `

        const $ = load(mdForTest().render(paginateDirs))
        const sections = $('section')

        expect(sections.eq(0).data('marpit-pagination')).toBeUndefined()
        expect(sections.eq(0).data('marpit-pagination-total')).toBeUndefined()
        expect(sections.eq(1).data('marpit-pagination')).toBeUndefined()
        expect(sections.eq(1).data('marpit-pagination-total')).toBeUndefined()
        expect(sections.eq(2).data('marpit-pagination')).toBe(2)
        expect(sections.eq(2).data('marpit-pagination-total')).toBe(2)
      })
    })
  })
})
