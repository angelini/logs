import { el, list, mount, List } from 'redom';
import { Maybe } from 'true-myth';

function whenJust<T>(maybe: Maybe<T>, fn: (arg: T) => void) {
    maybe.match({
        Just: fn,
        Nothing: () => null,
    });
}

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

    equals(maybeOther: Maybe<Bound>): boolean {
        return maybeOther.mapOrElse(() => false,
            (other) => this.boundary == other.boundary && this.index == other.index
        );
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
        public selection: Maybe<Selection>,
    ) {}

    static fromArray(data: string[]): Line[] {
        return data.map(datum => new Line(datum, new Map(), Maybe.nothing()));
    }
}

class Bounds {
    left: Maybe<Bound>;
    right: Maybe<Bound>;

    constructor() {
        this.left = Maybe.nothing();
        this.right = Maybe.nothing();
    }

    empty(): boolean {
        return this.left.isNothing() && this.right.isNothing();
    }

    select(lines: Line[]): Maybe<Selection>[] {
        return lines.map(line => this.findSelection(line.text));
    }

    findNext(lines: Line[], row: number, column: number): Bounds {
        const newBounds = new Bounds();
        const closestLeft = this.closestBound(lines[row].text, column, -1);

        if (this.empty()) {
            newBounds.left = closestLeft;
            return newBounds;
        }

        const left = this.left.unsafelyUnwrap();
        if (!left.equals(closestLeft)) {
            newBounds.left = closestLeft;
            return newBounds;
        }

        if (this.left.isJust() && this.right.isJust()) {
            return newBounds;
        }

        newBounds.left = closestLeft;
        newBounds.right = this.closestBound(lines[row].text, column, 1);
        return newBounds;
    }

    private closestBound(text: string, index: number, increment: number): Maybe<Bound> {
        for (let boundKey of Object.keys(BoundChar)) {
            const char = BoundChar[boundKey as any] as BoundChar;
            if (text[index] == char) {
                return Maybe.of(
                    new Bound(char, this.indexOfBound(text.substring(0, index), char))
                );
            }
        }
        if (index > 0) {
            return this.closestBound(text, index + increment, increment);
        }
        return Maybe.nothing()
    }

    private indexOfBound(text: string, boundary: BoundChar): number {
        return text.split(boundary).length - 1
    }

    private findSelection(text: string): Maybe<Selection> {
        if (this.empty()) {
            return Maybe.nothing();
        }
        const left = this.left.unsafelyUnwrap();
        const leftColumn = left.column(text);
        const sub = text.substring(leftColumn + 1);

        return Maybe.of(this.right.mapOrElse(() => {
            return new Selection(leftColumn + 1, leftColumn + sub.indexOf(left.closingCharacter()))
        }, (right) => {
            return new Selection(leftColumn + 1, right.column(text) - 1);
        }));
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

    private wrapCharacters(str: string, selection: Maybe<Selection>): HTMLElement[] {
        return str.split('').map((char, index) => {
            const span = el('span', char);
            whenJust(selection, (s) => {
                if (s.contains(index)) {
                    span.classList.add('highlight');
                }
            });
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

    bounds: Bounds;
    callback: (name: string, bounds: Bounds) => void;

    constructor(callback: (name: string, bounds: Bounds) => void) {
        this.el = el('form#save-tag',
            this.name = el('input.name', {type: 'text', placeholder: 'Tag Name'}) as HTMLInputElement,
            this.submit = el('button', {type: 'submit'}, 'Save Tag') as HTMLButtonElement,
        );
        this.bounds = new Bounds();
        this.callback = callback;

        this.el.onsubmit = e => {
            e.preventDefault();

            if (!this.bounds.empty()) {
                callback(this.name.value, this.bounds);
                this.update(new Bounds());
            }
        }
    }

    update(bounds: Bounds) {
        this.bounds = bounds;
        this.submit.disabled = this.bounds.empty();
    }
}

class App {
    el: HTMLElement;
    save: SaveTag;
    rows: List;

    lines: Line[];
    bounds: Bounds;

    constructor() {
        this.el = el('div',
            this.save = new SaveTag((name, bound) => this.addTag(name)),
            this.rows = list('div.rows', Row)
        );
        this.lines = [];
        this.bounds = new Bounds();

        this.rows.el.onclick = e => {
            e.preventDefault();

            const target = e.target as HTMLElement;
            if (target.tagName != 'SPAN') return;
            this.selectAtChar(target);
        }
    }

    update({lines, bounds}: {lines: Line[], bounds: Bounds}) {
        this.bounds = bounds;
        this.lines = lines;

        const selections = this.bounds.select(this.lines);
        this.lines.forEach((line, index) => {
            line.selection = selections[index];
        });

        this.save.update(this.bounds);
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
        this.update({
            lines: this.lines,
            bounds: this.bounds.findNext(this.lines, row, column)
        });
    }

    private addTag(name: string) {
        const selections = this.bounds.select(this.lines);
        this.lines.forEach((line, index) => {
            const selection = selections[index];
            whenJust(selections[index], s => {
                line.tags.set(name, line.text.substring(s.start, s.stop + 1));
            });
        });

        this.update({lines: this.lines, bounds: new Bounds()});
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

app.update({lines: Line.fromArray(data), bounds: new Bounds()});

mount(document.getElementById('root'), app);