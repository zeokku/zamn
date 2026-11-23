//! The zamn template of a Vue single-file component.
//!
//! This follows how Vue's SFC parser (`@vue/compiler-core`, `parseMode: "sfc"`)
//! reads the root of a file: every root block but `<template>` is raw text up
//! to its own closing tag, and so is a `<template>` whose `lang` is not `html`,
//! up to the first `</template`. Closing tags match without regard to case.

use std::ops::Range;

/// The byte range of the content of the file's root `<template lang="zamn">`,
/// or `None` if its first root `<template>` is not zamn, or it has none.
pub fn zamn_template(sfc: &str) -> Option<Range<usize>> {
    let mut i = 0;
    while let Some(found) = sfc[i..].find('<') {
        let start = i + found;
        let rest = &sfc[start..];
        if rest.starts_with("<!--") {
            i = rest.find("-->").map_or(sfc.len(), |end| start + end + 3);
            continue;
        }
        let name_start = start + 1;
        let name_len = sfc[name_start..]
            .find(|c: char| c.is_ascii_whitespace() || c == '>' || c == '/')
            .unwrap_or(sfc.len() - name_start);
        let name = &sfc[name_start..name_start + name_len];
        if !name.starts_with(|c: char| c.is_ascii_alphabetic()) {
            i = name_start;
            continue;
        }
        let (lang, open_end, self_closing) = open_tag(sfc, name_start + name_len);
        if name == "template" {
            if lang.as_deref() != Some("zamn") || self_closing {
                return None;
            }
            let end = find_closing(sfc, open_end, "template").unwrap_or(sfc.len());
            return Some(open_end..end);
        }
        if self_closing {
            i = open_end;
            continue;
        }
        i = match find_closing(sfc, open_end, name) {
            Some(close) => sfc[close..]
                .find('>')
                .map_or(sfc.len(), |gt| close + gt + 1),
            None => sfc.len(),
        };
    }
    None
}

/// Reads the attributes of an open tag from `at` (just after its name): the
/// value of `lang`, the offset just after the tag's `>`, and whether it ends
/// in `/>`.
fn open_tag(sfc: &str, at: usize) -> (Option<String>, usize, bool) {
    let bytes = sfc.as_bytes();
    let mut i = at;
    let mut lang = None;
    while i < bytes.len() {
        match bytes[i] {
            b'>' => return (lang, i + 1, i > at && bytes[i - 1] == b'/'),
            c if c.is_ascii_whitespace() || c == b'/' => i += 1,
            _ => {
                let name_start = i;
                while i < bytes.len()
                    && !matches!(bytes[i], b'=' | b'>' | b'/')
                    && !bytes[i].is_ascii_whitespace()
                {
                    i += 1;
                }
                let name = &sfc[name_start..i];
                while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                    i += 1;
                }
                if i >= bytes.len() || bytes[i] != b'=' {
                    continue;
                }
                i += 1;
                while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                    i += 1;
                }
                let value = match bytes.get(i) {
                    Some(&q @ (b'"' | b'\'')) => {
                        let end = sfc[i + 1..]
                            .find(q as char)
                            .map_or(sfc.len(), |e| i + 1 + e);
                        let value = &sfc[i + 1..end];
                        i = (end + 1).min(sfc.len());
                        value
                    }
                    _ => {
                        let value_start = i;
                        while i < bytes.len() && bytes[i] != b'>' && !bytes[i].is_ascii_whitespace()
                        {
                            i += 1;
                        }
                        &sfc[value_start..i]
                    }
                };
                if name == "lang" {
                    lang = Some(value.trim().to_owned());
                }
            }
        }
    }
    (lang, sfc.len(), false)
}

/// The offset of the first `</name` from `from` that is followed by the end of
/// a tag name, matched without regard to case.
fn find_closing(sfc: &str, from: usize, name: &str) -> Option<usize> {
    let bytes = sfc.as_bytes();
    let needle = format!("</{name}");
    let mut i = from;
    while i + needle.len() <= bytes.len() {
        if bytes[i..i + needle.len()].eq_ignore_ascii_case(needle.as_bytes()) {
            let next = bytes.get(i + needle.len());
            if next.is_none_or(|&c| c == b'>' || c == b'/' || c.is_ascii_whitespace()) {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::zamn_template;

    fn content(sfc: &str) -> Option<&str> {
        zamn_template(sfc).map(|r| &sfc[r])
    }

    #[test]
    fn finds_the_template() {
        let sfc = "<script setup lang=\"ts\">\nconst a = 1\n</script>\n\n<template lang=\"zamn\">\np {\n  b hi\n}\n</template>\n";
        assert_eq!(content(sfc), Some("\np {\n  b hi\n}\n"));
    }

    #[test]
    fn reads_lang_in_any_quoting() {
        assert_eq!(content("<template lang='zamn'>p</template>"), Some("p"));
        assert_eq!(content("<template lang=zamn>p</template>"), Some("p"));
        assert_eq!(
            content("<template\n  lang = \"zamn\"\n>p</template>"),
            Some("p")
        );
    }

    #[test]
    fn skips_other_blocks_and_comments() {
        let sfc = "<!-- <template lang=\"zamn\">no</template> -->\n<script>\nconst t = '<template lang=\"zamn\">no</template>'\n</script>\n<template lang=\"zamn\">yes</template>";
        assert_eq!(content(sfc), Some("yes"));
    }

    #[test]
    fn ends_at_the_first_closing_tag_in_any_case() {
        assert_eq!(
            content("<template lang=\"zamn\">a</TEMPLATE >b</template>"),
            Some("a")
        );
        assert_eq!(
            content("<template lang=\"zamn\">a</templates></template>"),
            Some("a</templates>")
        );
    }

    #[test]
    fn needs_a_zamn_template() {
        assert_eq!(content("<template><p>hi</p></template>"), None);
        assert_eq!(content("<template lang=\"pug\">p hi</template>"), None);
        assert_eq!(content("<script>export default {}</script>"), None);
    }

    #[test]
    fn runs_to_the_end_without_a_closing_tag() {
        assert_eq!(
            content("<template lang=\"zamn\">\np hi\n"),
            Some("\np hi\n")
        );
    }
}
