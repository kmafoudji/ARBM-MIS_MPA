import { useEffect, useMemo, useRef, useState } from "react";
import Flag from "./Flag";
import Icon from "./Icon";

/**
 * Searchable multi-select: selected items as chips, a search box that
 * filters the list, and a dropdown where clicking a row toggles it without
 * closing, so several items can be picked with the mouse in a row.
 *
 * Props:
 *   options   [{ value, label, iso2?, disabled? }] — iso2 renders a Flag
 *   value     array of selected values (compared with String(), returned as
 *             the original option values, so callers keep their own type)
 *   onChange  (values) => void
 *   placeholder, id
 */
export default function MultiSelect({ options = [], value = [], onChange, placeholder, id }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selectedKeys = useMemo(() => new Set(value.map(String)), [value]);
  const selected = useMemo(
    () => options.filter((o) => selectedKeys.has(String(o.value))),
    [options, selectedKeys],
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
    setOpen(true);
    setActive(0);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function toggle(opt) {
    if (opt.disabled) return;
    const key = String(opt.value);
    if (selectedKeys.has(key)) {
      onChange(value.filter((v) => String(v) !== key));
    } else {
      onChange([...value, opt.value]);
    }
    inputRef.current?.focus();
  }

  function remove(opt) {
    onChange(value.filter((v) => String(v) !== String(opt.value)));
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
        toggle(filtered[active]);
      } else if (!open) {
        e.preventDefault();
        openMenu();
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Backspace" && query === "" && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  }

  const listId = id ? `${id}-listbox` : undefined;

  return (
    <div className={`multiselect${open ? " is-open" : ""}`} ref={rootRef}>
      <div
        className="field-input multiselect-control"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        onMouseDown={(e) => {
          // Clicking the padding of the control focuses the search box.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
            openMenu();
          }
        }}
      >
        {selected.map((o) => (
          <span key={String(o.value)} className="badge multiselect-chip">
            {o.iso2 !== undefined && <Flag iso2={o.iso2} size={14} title={o.label} />}
            {o.label}
            <button
              type="button"
              className="multiselect-chip-remove"
              aria-label={`Remove ${o.label}`}
              onClick={() => remove(o)}
            >
              <Icon name="x" size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="multiselect-input"
          value={query}
          placeholder={selected.length === 0 ? placeholder : ""}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onFocus={openMenu}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <ul className="multiselect-menu" role="listbox" aria-multiselectable="true" id={listId} ref={listRef}>
          {filtered.length === 0 && <li className="multiselect-empty">No matches</li>}
          {filtered.map((o, i) => {
            const isSel = selectedKeys.has(String(o.value));
            return (
              <li
                key={String(o.value)}
                role="option"
                aria-selected={isSel}
                aria-disabled={o.disabled || undefined}
                className={`multiselect-option${isSel ? " is-selected" : ""}${i === active ? " is-active" : ""}${o.disabled ? " is-disabled" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(o)}
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
