//! Source map (v3) output.

use crate::Mapping;
use zamn_lexer::LineIndex;

pub struct Source<'a> {
    pub name: &'a str,
    pub content: &'a str,
}

const BASE64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn vlq(out: &mut String, value: i64) {
    let mut v = if value < 0 {
        ((-value) << 1) | 1
    } else {
        value << 1
    } as u64;
    loop {
        let mut digit = (v & 31) as usize;
        v >>= 5;
        if v != 0 {
            digit |= 32;
        }
        out.push(BASE64[digit] as char);
        if v == 0 {
            break;
        }
    }
}

/// Build the source map JSON for `html`. `sources[i]` is the file with id `i`;
/// `mappings` must be ordered by generated offset (as `generate` returns them).
pub fn build(
    html: &str,
    mappings: &[Mapping],
    sources: &[Source<'_>],
    file: Option<&str>,
    sources_content: bool,
) -> String {
    let indexes: Vec<LineIndex<'_>> = sources.iter().map(|s| LineIndex::new(s.content)).collect();
    let mut out = String::new();

    // Position in the generated file, advanced incrementally.
    let mut offset = 0usize;
    let mut column = 0i64;
    let mut first_in_line = true;
    let mut last_generated = None;
    // Previous values, for delta encoding.
    let (mut prev_column, mut prev_file, mut prev_line, mut prev_src_column) =
        (0i64, 0i64, 0i64, 0i64);

    for m in mappings {
        if last_generated == Some(m.generated) || m.file as usize >= sources.len() {
            continue;
        }
        last_generated = Some(m.generated);
        for c in html[offset..m.generated as usize].chars() {
            if c == '\n' {
                out.push(';');
                column = 0;
                prev_column = 0;
                first_in_line = true;
            } else {
                column += c.len_utf16() as i64;
            }
        }
        offset = m.generated as usize;

        let pos = indexes[m.file as usize].position(m.source);
        let (line, src_column) = (pos.line as i64 - 1, pos.column as i64);
        if !first_in_line {
            out.push(',');
        }
        first_in_line = false;
        vlq(&mut out, column - prev_column);
        vlq(&mut out, m.file as i64 - prev_file);
        vlq(&mut out, line - prev_line);
        vlq(&mut out, src_column - prev_src_column);
        prev_column = column;
        prev_file = m.file as i64;
        prev_line = line;
        prev_src_column = src_column;
    }

    let mut map = serde_json::Map::new();
    map.insert("version".into(), 3.into());
    if let Some(file) = file {
        map.insert("file".into(), file.into());
    }
    map.insert(
        "sources".into(),
        sources.iter().map(|s| s.name).collect::<Vec<_>>().into(),
    );
    if sources_content {
        map.insert(
            "sourcesContent".into(),
            sources.iter().map(|s| s.content).collect::<Vec<_>>().into(),
        );
    }
    map.insert("names".into(), Vec::<String>::new().into());
    map.insert("mappings".into(), out.into());
    serde_json::Value::Object(map).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vlq_encoding() {
        let mut s = String::new();
        for v in [0, 1, -1, 16, 123] {
            vlq(&mut s, v);
        }
        assert_eq!(s, "ACDgB2H");
    }
}
