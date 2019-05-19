import { el, list, mount, List } from 'redom';
import { Maybe } from 'true-myth';

enum BoundChar {
    Bracket = "[",
    Quote = "\"",
    Space = " ",
}

class Bound {
    constructor(
        public boundary: BoundChar,
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
        return count;
    }

    closingCharacter(): string {
        if (this.boundary == BoundChar.Bracket) return "]";
        if (this.boundary == BoundChar.Quote) return "\"";
        if (this.boundary == BoundChar.Space) return " ";
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

    static parse(data: string[]): Line[] {
        return data.map(datum => new Line(datum, new Map(), null));
    }
}

class GroupSelector {
    static findBound(lines: Line[], row: number, column: number): Maybe<Bound> {
        return this.closestLeftBound(lines[row].text, column);
    }

    static select(lines: Line[], bound: Bound): Selection[] {
        return lines.map(line => {
            if (!bound) {
                return new Selection(0, line.text.length - 1);
            }
            return this.findSelection(line.text, bound)
        });
    }

    private static closestLeftBound(text: string, index: number): Maybe<Bound> {
        for (let boundKey of Object.keys(BoundChar)) {
            const char = BoundChar[boundKey as any] as BoundChar;
            if (text[index] == char) {
                return Maybe.of(
                    new Bound(char, this.indexOfBound(text.substring(0, index), char))
                );
            }
        }
        if (index > 0) {
            return this.closestLeftBound(text, index - 1);
        }
        return Maybe.nothing()
    }

    private static indexOfBound(text: string, boundary: BoundChar): number {
        return text.split(boundary).length - 1
    }

    private static findSelection(text: string, bound: Bound): Selection {
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

class SaveTag {
    el: HTMLElement;
    name: HTMLInputElement;
    submit: HTMLButtonElement;

    bound: Maybe<Bound>;
    callback: (name: string, bound: Bound) => void;

    constructor(callback: (name: string, bound: Bound) => void) {
        this.el = el('form#save-tag',
            this.name = el('input.name', {type: 'text', placeholder: 'Tag Name'}) as HTMLInputElement,
            this.submit = el('button', {type: 'submit'}, 'Save Tag') as HTMLButtonElement,
        );
        this.bound = Maybe.nothing();
        this.callback = callback;

        this.el.onsubmit = e => {
            e.preventDefault();

            this.bound.match({
                Just: (bound) => {
                    callback(this.name.value, bound);
                    this.name.value = '';
                },
                Nothing: () => null,
            });
        }
    }

    update(bound: Maybe<Bound>) {
        this.bound = bound;
        this.submit.disabled = this.bound.isNothing();
    }
}

class App {
    el: HTMLElement;
    save: SaveTag;
    rows: List;

    lines: Line[];
    bound: Maybe<Bound>;

    constructor() {
        this.el = el('div',
            this.save = new SaveTag((name, bound) => this.addTag(name, bound)),
            this.rows = list('div.rows', Row)
        );
        this.lines = [];
        this.bound = Maybe.nothing();

        this.rows.el.onclick = e => {
            e.preventDefault();

            const target = e.target as HTMLElement;
            if (target.tagName != 'SPAN') return;
            this.selectAtChar(target);
        }
    }

    update({lines, bound}: {lines: Line[], bound: Maybe<Bound>}) {
        this.bound = bound;
        this.lines = lines;
        this.save.update(this.bound);
        this.rows.update(this.lines);
    }

    private findIndex(char: HTMLElement) {
        const row = char.closest('.row');
        return [
            Array.from(row.closest('.rows').children).indexOf(row),
            Array.from(row.querySelector('.text').children).indexOf(char),
        ];
    }

    private selectAtChar(span: HTMLElement) {
        const [row, column] = this.findIndex(span);

        GroupSelector.findBound(this.lines, row, column).match({
            Just: (bound) => {
                const selections = GroupSelector.select(this.lines, bound);
                this.lines.forEach((line, index) => {
                    line.selection = selections[index];
                })

                this.update({lines: this.lines, bound: Maybe.of(bound)});
            },
            Nothing: () => null
        });
    }

    private addTag(name: string, bound: Bound) {
        const selections = GroupSelector.select(this.lines, bound);
        this.lines.forEach((line, index) => {
            const selection = selections[index];
            line.tags.set(name, line.text.substring(selection.start, selection.stop + 1));
        });

        this.update({lines: this.lines, bound: Maybe.nothing()});
    }
}

const app = new App();

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

app.update({lines: Line.parse(data), bound: Maybe.nothing()});

mount(document.getElementById('root'), app);