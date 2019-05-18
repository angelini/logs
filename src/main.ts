import { el, list, mount, List } from 'redom';

enum Boundary {
    Bracket = "[",
    Quote = "\"",
    Space = " ",
}

class BoundIndex {
    constructor(
        public boundary: Boundary,
        public index: number
    ) {}

    column(text: string): number {
        let count = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] == this.boundary) {
                if (this.index == count) return i;
                count++;
            }
        }
    }

    closingCharacter(): string {
        if (this.boundary == Boundary.Bracket) return "]";
        if (this.boundary == Boundary.Quote) return "\"";
        if (this.boundary == Boundary.Space) return " ";
    }
}

class Selection {
    constructor(
        public start: number,
        public stop: number,
    ) {}

    contains(index: number): boolean {
        return index >= this.start && index <= this.stop;
    }
}

class Line {
    constructor(
        public text: string,
        public tags: Map<string, string>,
        public selection: Selection,
    ) {}
}

class GroupSelector {
    select(lines: Line[], row: number, column: number): Selection[] {
        const bound = this.closestBound(lines[row].text, column);
        console.log(bound);
        return lines.map(line => {
            if (!bound) {
                return new Selection(0, line.text.length - 1);
            }
            return this.findSelection(line.text, bound)
        });
    }

    private closestBound(text: string, index: number): BoundIndex | null {
        for (let boundKey of Object.keys(Boundary)) {
            const boundary = Boundary[boundKey as any] as Boundary;
            if (text[index] == boundary) {
                return new BoundIndex(boundary, this.indexOfBound(text.substring(0, index), boundary));
            }
        }
        if (index > 0) {
            return this.closestBound(text, index - 1);
        }
    }

    private indexOfBound(text: string, boundary: Boundary): number {
        return text.split(boundary).length - 1
    }

    private findSelection(text: string, bound: BoundIndex): Selection {
        const column = bound.column(text);
        const sub = text.substring(column + 1);
        return new Selection(column + 1, column + sub.indexOf(bound.closingCharacter()));
    }
}

class Row {
    el: HTMLElement;
    text: HTMLElement;
    tags: HTMLElement;

    constructor() {
        this.el = el('div.row',
            this.text = el('pre.text', ''),
            this.tags = el('div.tags')
        );
    }

    update(line: Line, idx: number) {
        this.replaceChildren(this.text, this.wrapCharacters(line.text, line.selection));
        this.tags.textContent = Array.from(line.tags, ([key, val]) => key + ': ' + val).join(', ');
    }

    private wrapCharacters(str: string, selection: Selection | null): HTMLElement[] {
        return str.split('').map((char, index) => {
            const span = el('span', char);
            if (selection && selection.contains(index)) {
                span.classList.add('highlight');
            }
            return span;
        });
    }

    private replaceChildren(root: HTMLElement, children: HTMLElement[]) {
        for (const [i, child] of children.entries()) {
            const node = root.children[i];
            if (node) {
                root.replaceChild(child, node);
            } else {
                root.appendChild(child);
            }
        }
    }
}

class Rows {
    el: HTMLElement;
    rows: List;
    lines: Line[];
    selector: GroupSelector;

    constructor(selector: GroupSelector) {
        this.selector = selector;
        this.el = el('div', this.rows = list('div.rows', Row));

        this.el.onclick = e => {
            e.preventDefault();
            const target = e.target as HTMLElement;

            if (target.tagName != 'SPAN') {
                return;
            }

            const [row, column] = this.findIndex(target);
            const selections = this.selector.select(this.lines, row, column);

            this.lines.forEach((line, index) => {
                line.selection = selections[index];
            })

            this.update(this.lines);
        }
    }

    update(lines: Line[]) {
        this.lines = lines;
        this.rows.update(lines);
    }

    private findIndex(char: HTMLElement) {
        const row = char.closest('.row');
        return [
            Array.from(row.closest('.rows').children).indexOf(row),
            Array.from(row.querySelector('.text').children).indexOf(char),
        ];
    }
}

const rows = new Rows(new GroupSelector());

const data = [
    '109.169.248.247 - - [12/Dec/2015:18:25:11 +0100] "GET /administrator/ HTTP/1.1" 200 4263 "-" "Mozilla/5.0 (Windows NT 6.0; rv:34.0) Gecko/20100101 Firefox/34.0" "-"',
    '109.169.248.247 - - [12/Dec/2015:18:25:11 +0100] "POST /administrator/index.php HTTP/1.1" 200 4494 "http://google.ca/" "Mozilla/5.0 (Windows NT 6.0; rv:34.0) Gecko/20100101 Firefox/34.0" "-"',
    '46.72.177.4 - - [12/Dec/2015:18:31:08 +0100] "GET /administrator/ HTTP/1.1" 200 4263 "-" "Mozilla/5.0 (Windows NT 6.0; rv:34.0) Gecko/20100101 Firefox/34.0" "-"',
    '46.72.177.4 - - [12/Dec/2015:18:31:08 +0100] "POST /administrator/index.php HTTP/1.1" 200 4494 "http://google.ca/" "Mozilla/5.0 (Windows NT 6.0; rv:34.0) Gecko/20100101 Firefox/34.0" "-"',
    '83.167.113.100 - - [12/Dec/2015:18:31:25 +0100] "GET /administrator/ HTTP/1.1" 200 4263 "-" "Mozilla/5.0 (Windows NT 6.0; rv:34.0) Gecko/20100101 Firefox/34.0" "-"',
    '83.167.113.100 - - [12/Dec/2015:18:31:25 +0100] "POST /administrator/index.php HTTP/1.1" 200 4494 "http://google.ca/" "Mozilla/5.0 (Windows NT 6.0; rv:34.0) Gecko/20100101 Firefox/34.0" "-"',
    '95.29.198.15 - - [12/Dec/2015:18:32:10 +0100] "GET /administrator/ HTTP/1.1" 200 4263 "-" "Mozilla/5.0 (Windows NT 6.0; rv:34.0) Gecko/20100101 Firefox/34.0" "-"',
    '95.29.198.15 - - [12/Dec/2015:18:32:11 +0100] "POST /administrator/index.php HTTP/1.1" 200 4494 "http://google.ca/" "Mozilla/5.0 (Windows NT 6.0; rv:34.0) Gecko/20100101 Firefox/34.0" "-"',
];

function parse(data: string[]): Line[] {
    return data.map(datum => {
        const splits = datum.split(' ');
        return new Line(datum, new Map([
            ['ip', splits[0]]
        ]), null);
    });
}

rows.update(parse(data));

mount(document.getElementById('root'), rows);

console.log(parse(data));