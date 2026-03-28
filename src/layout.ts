const TAIL_TOP = 8 + 40.5 + 5 + 27 * 3
const RIGHT_MARGIN = 165
const ROW_H = 36
const TAIL_FONT_SIZE = 24
const TAIL_HEADER_HEIGHT = 35
const TAIL_BORDER = 1.5
class Config {
	windowWidth: number
	constructor(public ns: NS) {
		this.windowWidth = ns.ui.windowSize()[0]
	}
	tailHeight(lines: number) {
		return lines * TAIL_FONT_SIZE + TAIL_HEADER_HEIGHT
	}
	tailWidth(chars: number) {
		return chars * (TAIL_FONT_SIZE / 2.5) + TAIL_BORDER * 2
	}
	leftFromRight(width: number) {
		return this.windowWidth - width - RIGHT_MARGIN
	}
	resize(width: number, height: number) {
		this.ns.ui.resizeTail(this.tailWidth(width), this.tailHeight(height))
	}
	apply(width: number, height: number, idx: number) {
		this.ns.ui.closeTail()
		this.ns.ui.openTail()
		this.ns.ui.moveTail(this.leftFromRight(this.tailWidth(width)), idx * ROW_H + TAIL_TOP)
		this.resize(width, height)
	}
}
export function genConfig(ns: NS) {
	return new Config(ns)
}