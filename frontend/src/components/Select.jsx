import { useEffect, useMemo, useRef, useState } from "react";
import Flag from "./Flag";
import Icon from "./Icon";

/**
 * Searchable single select, the one-value sibling of MultiSelect. Closed, the
 * input shows the selected label; focusing or typing turns it into a search
 * box over the options. Picking a row sets the value and closes.
 *
 * A visually hidden native <select> mirrors the value so the surrounding
 * <form> keeps `required` validation and `name` submission for free.
 *
 * Props:
 *   options      [{ value, label, iso2?, disabled? }] — iso2 renders a Flag
 *   value        selected value ("" / null / undefined = nothing selected);
 *                compared with String(), returned as the original option value
 *   onChange     (value) => void — "" when cleared
 *   placeholder  default "Select…"
 *   id, name, required, disabled
 */
export default function Select({
  options = [],
  value,
  onChange,
  placeholder = "Select…",
  id,
  name,
  required = false,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const isEmpty = value === "" || value === null || value === undefined;
  const selected = useMemo(
    () => (isEmpty ? null : options.find((o) => String(o.value) === String(value)) || null),
    [options, value, isEmpty],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[active];
    if (el?.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [active]);

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    // Start on the selected row so Enter without typing keeps the value.
    const idx = selected ? filtered.findIndex((o) => String(o.value) === String(selected.value)) : 0;
    setActive(Math.max(idx, 0));
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(opt) {
    if (opt.disabled) return;
    onChange(opt.value);
    close();
    inputRef.current?.focus();
  }

  function clear() {
    if (disabled) return;
    onChange("");
    setQuery("");
    inputRef.current?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openMenu();
      else setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[active]) {
        e.preventDefault();
        choose(filtered[active]);
      } else if (!open) {
        e.preventDefault();
        openMenu();
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Backspace" && query === "" && selected && !required) {
      clear();
    }
  }

  const listId = id ? `${id}-listbox` : undefined;
  const rootClass =
    "select" + (open ? " is-open" : "") + (disabled ? " is-disabled" : "");

  return (
    <div className={rootClass} ref={rootRef}>
      <div
        className="field-input select-control"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-disabled={disabled || undefined}
        onMouseDown={(e) => {
          // Clicking anywhere but the clear button focuses the search box.
          if (e.target.closest?.(".select-clear")) return;
          if (e.target !== inputRef.current) {
            e.preventDefault();
            inputRef.current?.focus();
            if (!open) openMenu();
          }
        }}
      >
        {selected?.iso2 !== undefined && (
          <Flag iso2={selected.iso2} size={16} title={selected.label} />
        )}
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="select-input"
          value={open ? query : selected?.label || ""}
          placeholder={open && selected ? selected.label : placeholder}
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onFocus={openMenu}
          onKeyDown={onKeyDown}
        />
        {selected && !required && !disabled && (
          <button
            type="button"
            className="select-clear"
            aria-label="Clear selection"
            tabIndex={-1}
            onClick={clear}
          >
            <Icon name="x" size={12} />
          </button>
        )}
        <span className="select-chevron" aria-hidden="true">
          <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
        </span>
        {/* Native mirror: keeps required-validation and form submission. */}
        <select
          className="select-native"
          name={name}
          required={required}
          disabled={disabled}
          value={isEmpty ? "" : String(value)}
          onChange={() => {}}
          onFocus={() => inputRef.current?.focus()}
          aria-hidden="true"
          tabIndex={-1}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      </div>
      {open && (
        <ul className="multiselect-menu select-menu" role="listbox" id={listId} ref={listRef}>
          {filtered.length === 0 && <li className="multiselect-empty">No matches</li>}
          {filtered.map((o, i) => {
            const isSel = selected ? String(o.value) === String(selected.value) : false;
            return (
              <li
                key={String(o.value)}
                role="option"
                aria-selected={isSel}
                aria-disabled={o.disabled || undefined}
                className={`multiselect-option${isSel ? " is-selected" : ""}${i === active ? " is-active" : ""}${o.disabled ? " is-disabled" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="multiselect-check">{isSel && <Icon name="check" size={12} />}</span>
                {o.iso2 !== undefined && <Flag iso2={o.iso2} size={16} title={o.label} />}
                <span className="multiselect-option-label">{o.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
