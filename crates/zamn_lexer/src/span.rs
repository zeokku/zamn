use serde::Serialize;

/// A half-open range of byte offsets into a source file.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize)]
pub struct Span {
    pub start: u32,
    pub end: u32,
}

impl Span {
    pub fn new(start: usize, end: usize) -> Self {
        Span {
            start: start as u32,
            end: end as u32,
        }
    }

    pub fn slice<'a>(&self, src: &'a str) -> &'a str {
        &src[self.start as usize..self.end as usize]
    }

    /// The smallest span covering both `self` and `other`.
    pub fn to(self, other: Span) -> Span {
        Span {
            start: self.start.min(other.start),
            end: self.end.max(other.end),
        }
    }
}

/// 1-based line, 0-based column counted in UTF-16 code units (the ESTree /
/// ESLint / source map convention).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Position {
    pub line: u32,
    pub column: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct Loc {
    pub start: Position,
    pub end: Position,
}

/// Converts byte offsets to line/column positions and UTF-16 offsets.
pub struct LineIndex<'a> {
    src: &'a str,
    /// Byte offset of the start of each line.
    starts: Vec<u32>,
    /// UTF-16 offset of the start of each line (empty when the source is ASCII).
    utf16_starts: Vec<u32>,
    ascii: bool,
}

impl<'a> LineIndex<'a> {
    pub fn new(src: &'a str) -> Self {
        let ascii = src.is_ascii();
        let mut starts = vec![0u32];
        let mut utf16_starts = if ascii { Vec::new() } else { vec![0u32] };
        let mut utf16 = 0u32;
        for (i, c) in src.char_indices() {
            utf16 += c.len_utf16() as u32;
            if c == '\n' {
                starts.push(i as u32 + 1);
                if !ascii {
                    utf16_starts.push(utf16);
                }
            }
        }
        LineIndex {
            src,
            starts,
            utf16_starts,
            ascii,
        }
    }

    fn line_of(&self, offset: u32) -> usize {
        self.starts.partition_point(|&s| s <= offset) - 1
    }

    fn column(&self, line: usize, offset: u32) -> u32 {
        let start = self.starts[line];
        if self.ascii {
            offset - start
        } else {
            self.src[start as usize..offset as usize]
                .encode_utf16()
                .count() as u32
        }
    }

    pub fn position(&self, offset: u32) -> Position {
        let offset = offset.min(self.src.len() as u32);
        let line = self.line_of(offset);
        Position {
            line: line as u32 + 1,
            column: self.column(line, offset),
        }
    }

    /// The UTF-16 code unit offset for a byte offset.
    pub fn utf16(&self, offset: u32) -> u32 {
        let offset = offset.min(self.src.len() as u32);
        if self.ascii {
            return offset;
        }
        let line = self.line_of(offset);
        self.utf16_starts[line] + self.column(line, offset)
    }

    pub fn loc(&self, span: Span) -> Loc {
        Loc {
            start: self.position(span.start),
            end: self.position(span.end),
        }
    }

    pub fn range(&self, span: Span) -> [u32; 2] {
        [self.utf16(span.start), self.utf16(span.end)]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf16_positions() {
        let src = "a\n😀b\nc";
        let idx = LineIndex::new(src);
        let b = src.find('b').unwrap() as u32;
        assert_eq!(idx.position(b), Position { line: 2, column: 2 });
        assert_eq!(idx.utf16(b), 4);
        let c = src.find('c').unwrap() as u32;
        assert_eq!(idx.position(c), Position { line: 3, column: 0 });
        assert_eq!(idx.utf16(c), 6);
    }
}
