# docs

## attributes > over several lines

what's the point of paragraph about '(' and ')'

## pipe inline should behave as entity tag and be used after :

```
div some text
div | some text
div |{ some text }
```

this:

```
div some text
div: | some text
div: |{ some text }
```

```
pre |{ }

// should be

pre: |{ }
// or
pre {
  |{
    ...
  }
}


```

to align with one line logic and no special handling for | entity

## piped text

two consecutive | should not add any new lines
and spaces should be trimmed both ends: after | and at the end of line

## cheatsheet on main page accessible with /#cheatsheet

## "not supported" page is redundant and may confuse agents, only list existing features

## ecosystem, project setup show setup code instead of describing it

ok code is actually shown in separate sections but "step by step" should be reworked somehow, so it's clear all setup is covered next

## zamn-vue package which has that { render } object setup already

## !convert docs to zamn using zamn-convert !

## "The template is turned into HTML that Vue's compiler parses"

regarding vue-language-plugin-zamn
does -pug uses the same workflow?

## component names and eslint example should use kebab-case

## ask prettier website to add zamn plugin to there

## better comments docs are wrong about `//! note` being alert as it needs extra space before
