import { atom, useAtomValue, useSetAtom } from "jotai";
import { GAP, OVERSCAN_ROWS, ROW_COUNT, VISIBLE_ROWS } from "../utils/constants";

const rowHeightAtom = atom(0);
const scrollOffsetAtom = atom(0);
const scrollDirectionAtom = atom<"up" | "down">("down");

const rowStrideAtom = atom((get) => get(rowHeightAtom) + GAP);

const isMeasuredAtom = atom((get) => get(rowHeightAtom) > 0);

const firstVisibleRowIndexAtom = atom((get) =>
  Math.floor(get(scrollOffsetAtom) / get(rowStrideAtom))
);

const focusedRowIndexAtom = atom(
  (get) => get(firstVisibleRowIndexAtom) + Math.floor(VISIBLE_ROWS / 2)
);

const visibleRangeAtom = atom((get) => {
  const firstVisibleRowIndex = get(firstVisibleRowIndexAtom);
  const start = Math.max(0, firstVisibleRowIndex - OVERSCAN_ROWS);
  const end = Math.min(ROW_COUNT, firstVisibleRowIndex + VISIBLE_ROWS + 1 + OVERSCAN_ROWS);
  return { start, end };
});

const totalHeightAtom = atom((get) => ROW_COUNT * get(rowStrideAtom));

const useIsMeasured = () => useAtomValue(isMeasuredAtom);
const useRowHeight = () => useAtomValue(rowHeightAtom);
const useSetRowHeight = () => useSetAtom(rowHeightAtom);

const useSetScrollOffset = () => useSetAtom(scrollOffsetAtom);

const useScrollDirection = () => useAtomValue(scrollDirectionAtom);
const useSetScrollDirection = () => useSetAtom(scrollDirectionAtom);

const useFocusedRowIndex = () => useAtomValue(focusedRowIndexAtom);
const useVisibleRange = () => useAtomValue(visibleRangeAtom);
const useRowStride = () => useAtomValue(rowStrideAtom);
const useTotalHeight = () => useAtomValue(totalHeightAtom);

export {
  useIsMeasured,
  useRowHeight,
  useSetRowHeight,
  useSetScrollOffset,
  useScrollDirection,
  useSetScrollDirection,
  useFocusedRowIndex,
  useVisibleRange,
  useRowStride,
  useTotalHeight,
};
