import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const THICKNESSES = ["1cm", "2cm", "3cm"];
const MATERIALS = ["Natural Stone", "Quartz", "Porcelain"];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatStockNumber(n) {
  return "R-" + String(n).padStart(4, "0");
}

function rowToSlab(row) {
  return {
    id: row.id,
    stockNumber: row.stock_number,
    colorName: row.color_name,
    width: row.width,
    height: row.height,
    thickness: row.thickness,
    material: row.material || "",
    job: row.job || "",
    notes: row.notes || "",
    photo: row.photo || null,
    flagged: row.flagged || false,
    createdAt: row.created_at,
  };
}

function slabToRow(slab) {
  return {
    id: slab.id,
    stock_number: slab.stockNumber,
    color_name: slab.colorName,
    width: slab.width,
    height: slab.height,
    thickness: slab.thickness,
    material: slab.material || null,
    job: slab.job || null,
    notes: slab.notes || null,
    photo: slab.photo || null,
    flagged: slab.flagged || false,
    created_at: slab.createdAt,
  };
}

const emptyForm = {
  photo: null,
  colorName: "",
  width: "",
  height: "",
  thickness: "2cm",
  material: "",
  notes: "",
  job: "",
};

export default function App() {
  const [screen, setScreen] = useState("home");
  const [slabs, setSlabs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSlab, setSelectedSlab] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [newSlabConfirm, setNewSlabConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [minWidth, setMinWidth] = useState("");
  const [minHeight, setMinHeight] = useState("");
  const [filterMaterial, setFilterMaterial] = useState("");
  const [filterThickness, setFilterThickness] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [checkScanned, setCheckScanned] = useState(new Set());
  const [checkInput, setCheckInput] = useState("");
  const [checkError, setCheckError] = useState("");
  const addFileRef = useRef();
  const editFileRef = useRef();
  const checkInputRef = useRef();

const loadSlabs = useCallback(async (attempt = 1) => {
    const { data, error } = await supabase
      .from("slabs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Load error:", error);
      if (attempt < 3) {
        setTimeout(() => loadSlabs(attempt + 1), 2000);
      } else {
        showToast("Failed to load inventory.", "error");
        setLoaded(true);
      }
    } else {
      setSlabs((data || []).map(rowToSlab));
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadSlabs(); }, [loadSlabs]);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  function handlePhoto(e, target) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (target === "add") setForm((f) => ({ ...f, photo: ev.target.result }));
      if (target === "edit") setEditForm((f) => ({ ...f, photo: ev.target.result }));
    };
    reader.readAsDataURL(file);
  }

  async function getNextStockNumber() {
    const { data, error } = await supabase.rpc("increment_counter");
    if (error || !data) {
      const nums = slabs
        .map(s => parseInt((s.stockNumber || "").replace("R-", ""), 10))
        .filter(n => !isNaN(n));
      const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
      return formatStockNumber(next);
    }
    return formatStockNumber(data);
  }

  async function handleAdd() {
    if (!form.colorName.trim()) return showToast("Color name is required.", "error");
    if (!form.width || !form.height) return showToast("Dimensions are required.", "error");
    setSaving(true);
    try {
      const stockNumber = await getNextStockNumber();
      const slab = { ...form, id: generateId(), stockNumber, createdAt: new Date().toLocaleDateString() };
      const { error } = await supabase.from("slabs").insert([slabToRow(slab)]);
      if (error) throw error;
      setSlabs((s) => [slab, ...s]);
      setForm(emptyForm);
      setNewSlabConfirm(slab);
    } catch (e) {
      console.error(e);
      showToast("Failed to save remnant.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editForm.colorName.trim()) return showToast("Color name is required.", "error");
    if (!editForm.width || !editForm.height) return showToast("Dimensions are required.", "error");
    setSaving(true);
    try {
      const { error } = await supabase.from("slabs").update(slabToRow(editForm)).eq("id", editForm.id);
      if (error) throw error;
      setSlabs((s) => s.map((sl) => (sl.id === editForm.id ? editForm : sl)));
      setSelectedSlab(editForm);
      setEditMode(false);
      setEditForm(null);
      showToast("Remnant updated!");
    } catch (e) {
      console.error(e);
      showToast("Failed to update remnant.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id) {
    setSaving(true);
    try {
      const { error } = await supabase.from("slabs").delete().eq("id", id);
      if (error) throw error;
      setSlabs((s) => s.filter((sl) => sl.id !== id));
      setRemoveConfirm(null);
      setScreen("search");
      showToast("Remnant removed.");
    } catch (e) {
      console.error(e);
      showToast("Failed to remove remnant.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function finishCheck() {
    setSaving(true);
    try {
      const updates = slabs.map((sl) => ({ ...slabToRow(sl), flagged: !checkScanned.has(sl.id) }));
      const { error } = await supabase.from("slabs").upsert(updates);
      if (error) throw error;
      setSlabs((s) => s.map((sl) => ({ ...sl, flagged: !checkScanned.has(sl.id) })));
      setScreen("check_summary");
    } catch (e) {
      console.error(e);
      showToast("Failed to save check results.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function finalizeCheck() {
    setScreen("home");
    showToast("Inventory check complete.");
  }

  function startInventoryCheck() {
    if (slabs.length === 0) return showToast("No remnants to check.", "error");
    setCheckScanned(new Set());
    setCheckInput("");
    setCheckError("");
    setAbandonConfirm(false);
    setScreen("check");
    setTimeout(() => checkInputRef.current && checkInputRef.current.focus(), 100);
  }

  function handleCheckEntry(e) {
    e.preventDefault();
    const val = checkInput.trim().toUpperCase();
    if (!val) return;
    const match = slabs.find((s) => s.stockNumber && s.stockNumber.toUpperCase() === val);
    if (!match) { setCheckError('"' + val + '" not found in inventory.'); setCheckInput(""); return; }
    if (checkScanned.has(match.id)) { setCheckError(val + " already checked off."); setCheckInput(""); return; }
    setCheckScanned((prev) => new Set([...prev, match.id]));
    setCheckError("");
    setCheckInput("");
    setTimeout(() => checkInputRef.current && checkInputRef.current.focus(), 50);
  }

  function openDetail(slab) { setSelectedSlab(slab); setEditMode(false); setEditForm(null); setScreen("detail"); }
  function startEdit() { setEditForm({ ...selectedSlab }); setEditMode(true); }

  function handleEmailCustomer(slab) {
    const subject = encodeURIComponent("Remnant Slab \u2013 " + slab.stockNumber + " \u2013 " + slab.colorName);
    const body = encodeURIComponent("Hi,\n\nHere are the details for the remnant slab you inquired about:\n\nStock Number: " + slab.stockNumber + "\nColor: " + slab.colorName + "\nDimensions: " + slab.width + "\u2033 \xd7 " + slab.height + "\u2033\nThickness: " + slab.thickness + "\n" + (slab.material ? "Material: " + slab.material + "\n" : "") + "Status: " + (slab.job ? "Assigned to job: " + slab.job : "Available") + "\n" + (slab.notes ? "\nNotes: " + slab.notes + "\n" : "") + "\nPlease don't hesitate to reach out with any questions.\n");
    window.location.href = "mailto:?subject=" + subject + "&body=" + body;
  }

  function handleEmailMultiple(selectedSlabs) {
    const subject = encodeURIComponent("Remnant Slabs \u2013 " + selectedSlabs.length + " piece" + (selectedSlabs.length > 1 ? "s" : "") + " available");
    const lines = selectedSlabs.map((s, i) => { let line = (i + 1) + ". " + s.stockNumber + " \u2014 " + s.colorName + "\n"; line += "   Dimensions: " + s.width + "\u2033 x " + s.height + "\u2033  |  Thickness: " + s.thickness; if (s.material) line += "  |  " + s.material; line += "\n   Status: " + (s.job ? "Assigned to job: " + s.job : "Available"); if (s.notes) line += "\n   Notes: " + s.notes; return line; }).join("\n\n");
    const body = encodeURIComponent("Hi,\n\nHere are the remnant slabs we have available for you:\n\n" + lines + "\n\nPlease don't hesitate to reach out with any questions.\n");
    window.location.href = "mailto:?subject=" + subject + "&body=" + body;
  }

  const filteredSearch = slabs.filter((s) => {
    const q = searchQuery.toLowerCase();
    const textMatch = s.colorName.toLowerCase().includes(q) || (s.job && s.job.toLowerCase().includes(q)) || (s.notes && s.notes.toLowerCase().includes(q)) || s.thickness.toLowerCase().includes(q) || (s.stockNumber && s.stockNumber.toLowerCase().includes(q)) || (s.material && s.material.toLowerCase().includes(q));
    if (!textMatch) return false;
    if (filterMaterial && s.material !== filterMaterial) return false;
    if (filterThickness && s.thickness !== filterThickness) return false;
    if (minWidth && minHeight) { const mw = parseFloat(minWidth), mh = parseFloat(minHeight), sw = parseFloat(s.width), sh = parseFloat(s.height); if (!((sw >= mw && sh >= mh) || (sw >= mh && sh >= mw))) return false; }
    else if (minWidth) { if (parseFloat(s.width) < parseFloat(minWidth) && parseFloat(s.height) < parseFloat(minWidth)) return false; }
    else if (minHeight) { if (parseFloat(s.width) < parseFloat(minHeight) && parseFloat(s.height) < parseFloat(minHeight)) return false; }
    return true;
  });

  if (!loaded) return (<div style={styles.root}><div style={styles.bgTexture} /><div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, position: "relative", zIndex: 1 }}><div style={styles.logoMark}>◈</div><p style={styles.appSub}>Loading inventory…</p></div></div>);

  return (
    <div style={styles.root}>
      <div style={styles.bgTexture} />
      {toast && <div style={{ ...styles.toast, background: toast.type === "error" ? "#c0392b" : "#1a1a1a" }}>{toast.msg}</div>}
      {removeConfirm && (<div style={styles.modalOverlay}><div style={styles.modal}><p style={styles.modalTitle}>Remove this remnant?</p><p style={styles.modalSub}>{removeConfirm.colorName} · {removeConfirm.width}″ × {removeConfirm.height}″ · {removeConfirm.thickness}</p><div style={styles.modalBtns}><button style={styles.modalCancel} onClick={() => setRemoveConfirm(null)}>Cancel</button><button style={styles.modalConfirm} onClick={() => handleRemove(removeConfirm.id)}>Remove</button></div></div></div>)}
      {newSlabConfirm && (<div style={styles.modalOverlay}><div style={styles.modal}><p style={styles.newSlabTitle}>Remnant Added</p><p style={styles.newSlabSub}>{newSlabConfirm.colorName} · {newSlabConfirm.width}″ × {newSlabConfirm.height}″</p><div style={styles.newSlabBadgeBox}><span style={styles.newSlabBadgeLabel}>Stock Number</span><span style={styles.newSlabBadge}>{newSlabConfirm.stockNumber}</span><span style={styles.newSlabBadgeHint}>Write this on the slab</span></div><div style={styles.modalBtns}><button style={styles.modalCancel} onClick={() => { setNewSlabConfirm(null); setScreen("home"); }}>Done</button><button style={styles.submitBtn} onClick={() => { setNewSlabConfirm(null); setScreen("add"); }}>Add Another</button></div></div></div>)}

      {screen === "home" && (<div style={styles.page}><div style={styles.header}><div style={styles.logoMark}>◈</div><h1 style={styles.appTitle}>REMVENTORY</h1><p style={styles.appSub}>Slab Inventory</p></div><div style={styles.statsRow}><div style={styles.stat}><span style={styles.statNum}>{slabs.length}</span><span style={styles.statLabel}>Total</span></div><div style={styles.statDivider} /><div style={styles.stat}><span style={styles.statNum}>{slabs.filter((s) => s.job).length}</span><span style={styles.statLabel}>Assigned</span></div><div style={styles.statDivider} /><div style={styles.stat}><span style={styles.statNum}>{slabs.filter((s) => !s.job).length}</span><span style={styles.statLabel}>Available</span></div></div>{slabs.some(s => s.flagged) && (<div style={styles.flagBanner}>⚑ {slabs.filter(s => s.flagged).length} slab{slabs.filter(s => s.flagged).length > 1 ? "s" : ""} flagged as missing — review in inventory</div>)}<div style={styles.btnGrid}><button style={styles.primaryBtn} onClick={() => setScreen("add")}><span style={styles.btnIcon}>＋</span><span style={styles.btnLabel}>Add Remnant</span></button><button style={{ ...styles.primaryBtn, ...styles.btnSecondary }} onClick={() => { setSearchQuery(""); setScreen("search"); }}><span style={styles.btnIcon}>⌕</span><span style={styles.btnLabel}>View Inventory</span></button><button style={{ ...styles.primaryBtn, ...styles.btnCheck }} onClick={startInventoryCheck}><span style={styles.btnIcon}>✓</span><span style={styles.btnLabel}>Inventory Check</span></button></div></div>)}

      {screen === "add" && (<div style={styles.page}><div style={styles.navRow}><button style={styles.backBtn} onClick={() => setScreen("home")}>← Back</button><h2 style={styles.screenTitle}>Add Remnant</h2></div><div style={styles.photoBox} onClick={() => addFileRef.current.click()}>{form.photo ? <img src={form.photo} alt="Slab" style={styles.photoPreview} /> : <div style={styles.photoPlaceholder}><span style={styles.photoIcon}>◻</span><span style={styles.photoHint}>Tap to add photo</span></div>}<input ref={addFileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handlePhoto(e, "add")} /></div><div style={styles.fields}><label style={styles.label}>Color Name *</label><input style={styles.input} placeholder="e.g. Calacatta Gold" value={form.colorName} onChange={(e) => setForm((f) => ({ ...f, colorName: e.target.value }))} /><label style={styles.label}>Dimensions (inches) *</label><div style={styles.dimRow}><input style={{ ...styles.input, flex: 1 }} placeholder='Width"' type="number" value={form.width} onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))} /><span style={styles.dimX}>×</span><input style={{ ...styles.input, flex: 1 }} placeholder='Height"' type="number" value={form.height} onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))} /></div><label style={styles.label}>Thickness</label><div style={styles.thickRow}>{THICKNESSES.map((t) => (<button key={t} style={{ ...styles.thickBtn, ...(form.thickness === t ? styles.thickActive : {}) }} onClick={() => setForm((f) => ({ ...f, thickness: t }))}>{t}</button>))}</div><label style={styles.label}>Material</label><select style={{ ...styles.input, ...styles.select }} value={form.material} onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))}><option value="">Select material…</option>{MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}</select><label style={styles.label}>Assign to Job</label><input style={styles.input} placeholder="Job name or number (optional)" value={form.job} onChange={(e) => setForm((f) => ({ ...f, job: e.target.value }))} /><label style={styles.label}>Notes</label><textarea style={{ ...styles.input, ...styles.textarea }} placeholder="Any additional notes..." value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div><button style={{ ...styles.submitBtn, opacity: saving ? 0.6 : 1 }} onClick={handleAdd} disabled={saving}>{saving ? "Saving…" : "Save Remnant"}</button></div>)}

      {screen === "search" && (<div style={styles.page}><div style={styles.navRow}><button style={styles.backBtn} onClick={() => { setScreen("home"); setSelectMode(false); setSelectedIds(new Set()); }}>← Back</button><h2 style={styles.screenTitle}>Inventory</h2>{!selectMode ? <button style={styles.selectToggleBtn} onClick={() => { setSelectMode(true); setSelectedIds(new Set()); }}>Select</button> : <button style={styles.selectToggleBtn} onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>Cancel</button>}</div>{selectMode && (<div style={styles.selectToolbar}><span style={styles.selectCount}>{selectedIds.size} selected</span><button style={{ ...styles.emailBtn, width: "auto", padding: "10px 20px", marginBottom: 0, opacity: selectedIds.size === 0 ? 0.4 : 1 }} disabled={selectedIds.size === 0} onClick={() => handleEmailMultiple(slabs.filter(s => selectedIds.has(s.id)))}>✉ Email Selected</button></div>)}<input style={{ ...styles.input, marginBottom: 10 }} placeholder="Search color, job, stock number, notes…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /><div style={styles.dimFilterRow}><span style={styles.dimFilterLabel}>Min size</span><input style={{ ...styles.input, ...styles.dimFilterInput }} placeholder='W"' type="number" value={minWidth} onChange={(e) => setMinWidth(e.target.value)} /><span style={styles.dimX}>×</span><input style={{ ...styles.input, ...styles.dimFilterInput }} placeholder='H"' type="number" value={minHeight} onChange={(e) => setMinHeight(e.target.value)} />{(minWidth || minHeight) && (<button style={styles.clearDimBtn} onClick={() => { setMinWidth(""); setMinHeight(""); }}>✕</button>)}</div>{(minWidth || minHeight) && (<p style={styles.dimFilterNote}>Showing slabs that fit {minWidth || "any"}″ × {minHeight || "any"}″ (either orientation)</p>)}<div style={styles.filterDropdownRow}><select style={{ ...styles.input, ...styles.select, flex: 1 }} value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)}><option value="">All materials</option>{MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}</select><select style={{ ...styles.input, ...styles.select, flex: 1 }} value={filterThickness} onChange={(e) => setFilterThickness(e.target.value)}><option value="">All thicknesses</option>{THICKNESSES.map(t => <option key={t} value={t}>{t}</option>)}</select>{(filterMaterial || filterThickness) && (<button style={styles.clearDimBtn} onClick={() => { setFilterMaterial(""); setFilterThickness(""); }}>✕</button>)}</div><p style={styles.slabCount}>{filteredSearch.length} slab{filteredSearch.length !== 1 ? "s" : ""}</p>{filteredSearch.length === 0 && (<p style={styles.emptyMsg}>{slabs.length === 0 ? "No remnants in inventory." : "No matches found."}</p>)}<div style={styles.slabList}>{filteredSearch.map((slab) => { const isSelected = selectedIds.has(slab.id); return (<div key={slab.id} style={{ ...styles.card, ...(isSelected ? styles.cardSelected : {}) }} onClick={() => { if (selectMode) { setSelectedIds(prev => { const next = new Set(prev); next.has(slab.id) ? next.delete(slab.id) : next.add(slab.id); return next; }); } else { openDetail(slab); } }}><div style={styles.cardMain}>{selectMode && (<div style={{ ...styles.checkbox, ...(isSelected ? styles.checkboxChecked : {}) }}>{isSelected && <span style={styles.checkboxTick}>✓</span>}</div>)}{slab.photo ? <img src={slab.photo} alt={slab.colorName} style={styles.cardThumb} /> : <div style={styles.cardThumbEmpty}>◻</div>}<div style={styles.cardInfo}><div style={styles.cardTopRow}><span style={styles.cardColor}>{slab.colorName}</span>{slab.stockNumber && <span style={styles.cardStock}>{slab.stockNumber}</span>}</div><span style={styles.cardDims}>{slab.width}″ × {slab.height}″ · {slab.thickness}{slab.material ? " · " + slab.material : ""}</span>{slab.flagged ? <span style={styles.cardFlagged}>⚑ Missing — needs review</span> : slab.job ? <span style={styles.cardJob}>⬡ {slab.job}</span> : <span style={styles.cardAvail}>Available</span>}</div>{!selectMode && <span style={styles.cardArrow}>›</span>}</div></div>); })}</div></div>)}

      {screen === "detail" && selectedSlab && (<div style={styles.page}><div style={styles.navRow}><button style={styles.backBtn} onClick={() => { setEditMode(false); setScreen("search"); }}>← Back</button><h2 style={styles.screenTitle}>{editMode ? "Edit Remnant" : "Detail"}</h2>{!editMode && <button style={styles.editToggleBtn} onClick={startEdit}>Edit</button>}</div>{editMode ? (<div style={styles.photoBox} onClick={() => editFileRef.current.click()}>{editForm.photo ? <img src={editForm.photo} alt="Slab" style={styles.photoPreview} /> : <div style={styles.photoPlaceholder}><span style={styles.photoIcon}>◻</span><span style={styles.photoHint}>Tap to change photo</span></div>}<input ref={editFileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handlePhoto(e, "edit")} /></div>) : (selectedSlab.photo ? <img src={selectedSlab.photo} alt={selectedSlab.colorName} style={styles.detailPhoto} /> : <div style={{ ...styles.photoBox, cursor: "default", marginBottom: 24 }}><div style={styles.photoPlaceholder}><span style={styles.photoIcon}>◻</span><span style={styles.photoHint}>No photo</span></div></div>)}{editMode ? (<><div style={styles.fields}><label style={styles.label}>Color Name *</label><input style={styles.input} value={editForm.colorName} onChange={(e) => setEditForm((f) => ({ ...f, colorName: e.target.value }))} /><label style={styles.label}>Dimensions (inches) *</label><div style={styles.dimRow}><input style={{ ...styles.input, flex: 1 }} type="number" value={editForm.width} onChange={(e) => setEditForm((f) => ({ ...f, width: e.target.value }))} /><span style={styles.dimX}>×</span><input style={{ ...styles.input, flex: 1 }} type="number" value={editForm.height} onChange={(e) => setEditForm((f) => ({ ...f, height: e.target.value }))} /></div><label style={styles.label}>Thickness</label><div style={styles.thickRow}>{THICKNESSES.map(t => (<button key={t} style={{ ...styles.thickBtn, ...(editForm.thickness === t ? styles.thickActive : {}) }} onClick={() => setEditForm((f) => ({ ...f, thickness: t }))}>{t}</button>))}</div><label style={styles.label}>Material</label><select style={{ ...styles.input, ...styles.select }} value={editForm.material || ""} onChange={(e) => setEditForm((f) => ({ ...f, material: e.target.value }))}><option value="">Select material…</option>{MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}</select><label style={styles.label}>Assign to Job</label><input style={styles.input} placeholder="Job name or number (optional)" value={editForm.job} onChange={(e) => setEditForm((f) => ({ ...f, job: e.target.value }))} /><label style={styles.label}>Notes</label><textarea style={{ ...styles.input, ...styles.textarea }} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} /></div><div style={styles.editBtnRow}><button style={styles.cancelEditBtn} onClick={() => { setEditMode(false); setEditForm(null); }}>Cancel</button><button style={{ ...styles.submitBtn, flex: 1, opacity: saving ? 0.6 : 1 }} onClick={handleSaveEdit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</button></div></>) : (<><div style={styles.stockBadgeRow}><span style={styles.stockBadgeLabel}>Stock Number</span><span style={styles.stockBadge}>{selectedSlab.stockNumber}</span></div><div style={styles.detailBlock}><DetailRow label="Color" value={selectedSlab.colorName} /><DetailRow label="Dimensions" value={selectedSlab.width + "\u2033 \xd7 " + selectedSlab.height + "\u2033"} /><DetailRow label="Thickness" value={selectedSlab.thickness} /><DetailRow label="Material" value={selectedSlab.material || null} empty="Not specified" /><DetailRow label="Job" value={selectedSlab.job || null} empty="Unassigned" /><DetailRow label="Added" value={selectedSlab.createdAt} last={!selectedSlab.notes} />{selectedSlab.notes && <DetailRow label="Notes" value={selectedSlab.notes} italic last />}</div><button style={styles.emailBtn} onClick={() => handleEmailCustomer(selectedSlab)}>✉ Email Customer</button><button style={styles.removeBtnFull} onClick={() => setRemoveConfirm(selectedSlab)}>Remove Remnant</button></>)}</div>)}

      {screen === "check" && (<div style={styles.page}><div style={styles.navRow}>{abandonConfirm ? <div style={styles.abandonRow}><span style={styles.abandonPrompt}>Abandon check?</span><button style={styles.abandonYes} onClick={() => { setAbandonConfirm(false); setScreen("home"); }}>Yes</button><button style={styles.abandonNo} onClick={() => setAbandonConfirm(false)}>No</button></div> : <button style={styles.backBtn} onClick={() => setAbandonConfirm(true)}>✕ Abandon</button>}<h2 style={styles.screenTitle}>Inventory Check</h2><span style={styles.slabCount}>{checkScanned.size} / {slabs.length}</span></div><div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: Math.round((checkScanned.size / Math.max(slabs.length, 1)) * 100) + "%" }} /></div><div style={styles.checkInstructions}>Walk the yard and type each slab's stock number as you find it.</div><form onSubmit={handleCheckEntry} style={styles.checkEntryForm}><input ref={checkInputRef} style={{ ...styles.input, ...styles.checkEntryInput }} placeholder="e.g. R-0042" value={checkInput} onChange={e => { setCheckInput(e.target.value); setCheckError(""); }} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} /><button type="submit" style={styles.checkEntryBtn}>✓</button></form>{checkError && <p style={styles.checkError}>{checkError}</p>}{checkScanned.size > 0 && (<div style={styles.checkedSection}><p style={styles.checkedHeading}>Checked Off ({checkScanned.size})</p><div style={styles.slabList}>{slabs.filter(s => checkScanned.has(s.id)).map(slab => (<div key={slab.id} style={{ ...styles.card, borderColor: "#5A6E4A" }}><div style={styles.cardMain}>{slab.photo ? <img src={slab.photo} alt={slab.colorName} style={styles.cardThumb} /> : <div style={styles.cardThumbEmpty}>◻</div>}<div style={styles.cardInfo}><div style={styles.cardTopRow}><span style={styles.cardColor}>{slab.colorName}</span>{slab.stockNumber && <span style={styles.cardStock}>{slab.stockNumber}</span>}</div><span style={styles.cardDims}>{slab.width}″ × {slab.height}″ · {slab.thickness}</span></div><span style={{ fontSize: 20, color: "#5A6E4A" }}>✓</span></div></div>))}</div></div>)}<button style={{ ...styles.submitBtn, marginTop: 24, opacity: saving ? 0.6 : 1 }} onClick={finishCheck} disabled={saving}>{saving ? "Saving…" : "Finish Check (" + (slabs.length - checkScanned.size) + " remaining)"}</button></div>)}

      {screen === "check_summary" && (() => { const found = checkScanned.size; const missing = slabs.filter(s => !checkScanned.has(s.id)); return (<div style={styles.page}><h2 style={{ ...styles.screenTitle, marginBottom: 24, marginTop: 8 }}>Check Complete</h2><div style={styles.summaryGrid}><div style={styles.summaryCell}><span style={styles.summaryNum}>{found}</span><span style={styles.summaryLabel}>Found</span></div><div style={{ width: 1, background: "#333" }} /><div style={styles.summaryCell}><span style={{ ...styles.summaryNum, color: missing.length > 0 ? "#C0392B" : "#8B9E6A" }}>{missing.length}</span><span style={styles.summaryLabel}>Not Found</span></div></div>{missing.length > 0 ? (<><p style={styles.summaryMissingTitle}>⚑ Flagged for Review</p><p style={styles.summaryNote}>These slabs were not checked off. They've been flagged — remove them manually once confirmed missing.</p><div style={styles.slabList}>{missing.map(slab => (<div key={slab.id} style={{ ...styles.card, borderColor: "#C0392B" }}><div style={styles.cardMain}>{slab.photo ? <img src={slab.photo} alt={slab.colorName} style={styles.cardThumb} /> : <div style={styles.cardThumbEmpty}>◻</div>}<div style={styles.cardInfo}><div style={styles.cardTopRow}><span style={styles.cardColor}>{slab.colorName}</span>{slab.stockNumber && <span style={styles.cardStock}>{slab.stockNumber}</span>}</div><span style={styles.cardDims}>{slab.width}″ × {slab.height}″ · {slab.thickness}</span></div></div></div>))}</div></>) : (<p style={{ ...styles.summaryNote, color: "#5A6E4A", textAlign: "center", fontSize: 15 }}>✓ All {found} slabs accounted for.</p>)}<button style={{ ...styles.submitBtn, marginTop: 24 }} onClick={finalizeCheck}>Done</button></div>); })()}
    </div>
  );
}

function DetailRow({ label, value, empty, italic, last }) {
  return (<><div style={styles.detailRow}><span style={styles.detailFieldLabel}>{label}</span>{value ? <span style={{ ...styles.detailFieldValue, ...(italic ? { fontStyle: "italic", color: "#4A4A4A" } : {}) }}>{value}</span> : <em style={{ ...styles.detailFieldValue, color: "#A09070", fontStyle: "italic" }}>{empty}</em>}</div>{!last && <div style={styles.detailDivider} />}</>);
}

const styles = {
  root: { minHeight: "100vh", background: "#F2EDE6", fontFamily: "'Georgia', 'Times New Roman', serif", position: "relative", overflowX: "hidden" },
  bgTexture: { position: "fixed", inset: 0, backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(0,0,0,0.04) 39px, rgba(0,0,0,0.04) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(0,0,0,0.04) 39px, rgba(0,0,0,0.04) 40px)`, pointerEvents: "none", zIndex: 0 },
  page: { position: "relative", zIndex: 1, maxWidth: 480, margin: "0 auto", padding: "32px 20px 60px", display: "flex", flexDirection: "column" },
  header: { textAlign: "center", marginBottom: 32, marginTop: 24 },
  logoMark: { fontSize: 36, color: "#8B5A2B", lineHeight: 1, marginBottom: 8 },
  appTitle: { fontSize: 36, fontWeight: "normal", letterSpacing: "0.22em", color: "#1C1C1C", margin: 0, textTransform: "uppercase" },
  appSub: { fontSize: 12, letterSpacing: "0.22em", color: "#8B7355", marginTop: 4, textTransform: "uppercase" },
  statsRow: { display: "flex", justifyContent: "center", alignItems: "center", background: "#1C1C1C", borderRadius: 4, padding: "16px 24px", marginBottom: 16 },
  stat: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  statNum: { fontSize: 28, color: "#E8D5B7", fontWeight: "normal", letterSpacing: "0.05em" },
  statLabel: { fontSize: 10, color: "#8B7355", letterSpacing: "0.18em", textTransform: "uppercase" },
  statDivider: { width: 1, height: 36, background: "#333" },
  flagBanner: { background: "#C0392B", color: "#F2EDE6", borderRadius: 4, padding: "10px 14px", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16, textAlign: "center" },
  btnGrid: { display: "flex", flexDirection: "column", gap: 12 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 16, background: "#1C1C1C", color: "#F2EDE6", border: "none", borderRadius: 4, padding: "20px 24px", cursor: "pointer", fontSize: 16, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "inherit" },
  btnSecondary: { background: "#4A4A4A" },
  btnCheck: { background: "#5A6E4A" },
  btnIcon: { fontSize: 22, lineHeight: 1, width: 28, textAlign: "center" },
  btnLabel: { flex: 1, textAlign: "left" },
  navRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 },
  backBtn: { background: "none", border: "none", color: "#8B5A2B", fontFamily: "inherit", fontSize: 14, letterSpacing: "0.06em", cursor: "pointer", padding: 0, flexShrink: 0 },
  screenTitle: { fontSize: 20, fontWeight: "normal", letterSpacing: "0.16em", textTransform: "uppercase", color: "#1C1C1C", margin: 0, flex: 1 },
  slabCount: { fontSize: 12, color: "#8B7355", letterSpacing: "0.1em", flexShrink: 0, marginBottom: 10 },
  editToggleBtn: { background: "none", border: "1px solid #8B5A2B", color: "#8B5A2B", borderRadius: 4, padding: "6px 16px", fontFamily: "inherit", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer", flexShrink: 0 },
  photoBox: { border: "2px dashed #C4A882", borderRadius: 4, height: 200, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, cursor: "pointer", overflow: "hidden", background: "#EDE6DC" },
  photoPlaceholder: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10 },
  photoIcon: { fontSize: 48, color: "#C4A882" },
  photoHint: { fontSize: 13, color: "#8B7355", letterSpacing: "0.1em", textTransform: "uppercase" },
  photoPreview: { width: "100%", height: "100%", objectFit: "cover" },
  detailPhoto: { width: "100%", height: 220, objectFit: "cover", borderRadius: 4, marginBottom: 20, border: "1px solid #C4A882" },
  fields: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 },
  label: { fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8B7355", marginTop: 12, marginBottom: 2 },
  input: { background: "#EDE6DC", border: "1px solid #C4A882", borderRadius: 4, padding: "12px 14px", fontFamily: "inherit", fontSize: 15, color: "#1C1C1C", outline: "none", width: "100%", boxSizing: "border-box" },
  textarea: { resize: "vertical", minHeight: 80 },
  select: { appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238B7355'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32, cursor: "pointer" },
  dimRow: { display: "flex", alignItems: "center", gap: 10 },
  dimX: { fontSize: 18, color: "#8B7355", flexShrink: 0 },
  thickRow: { display: "flex", gap: 10 },
  thickBtn: { flex: 1, padding: "10px", background: "#EDE6DC", border: "1px solid #C4A882", borderRadius: 4, fontFamily: "inherit", fontSize: 14, color: "#4A4A4A", cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.15s" },
  thickActive: { background: "#8B5A2B", borderColor: "#8B5A2B", color: "#F2EDE6" },
  submitBtn: { background: "#1C1C1C", color: "#F2EDE6", border: "none", borderRadius: 4, padding: "18px", fontFamily: "inherit", fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer" },
  editBtnRow: { display: "flex", gap: 12 },
  cancelEditBtn: { flex: 1, padding: "18px", background: "#EDE6DC", border: "1px solid #C4A882", borderRadius: 4, fontFamily: "inherit", fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", color: "#4A4A4A" },
  detailBlock: { background: "#EDE6DC", border: "1px solid #C4A882", borderRadius: 4, overflow: "hidden", marginBottom: 20 },
  detailRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 16px", gap: 12 },
  detailDivider: { height: 1, background: "#C4A882", margin: "0 16px" },
  detailFieldLabel: { fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8B7355", flexShrink: 0, paddingTop: 2 },
  detailFieldValue: { fontSize: 15, color: "#1C1C1C", textAlign: "right" },
  emailBtn: { background: "#1C1C1C", color: "#F2EDE6", border: "none", borderRadius: 4, padding: "16px", fontFamily: "inherit", fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer", width: "100%", marginBottom: 10 },
  removeBtnFull: { background: "transparent", color: "#8B3A2B", border: "1px solid #8B3A2B", borderRadius: 4, padding: "16px", fontFamily: "inherit", fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer", width: "100%" },
  stockBadgeRow: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1C1C1C", borderRadius: 4, padding: "14px 18px", marginBottom: 12 },
  stockBadgeLabel: { fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8B7355" },
  stockBadge: { fontSize: 22, letterSpacing: "0.12em", color: "#E8D5B7", fontFamily: "monospace", fontWeight: "bold" },
  slabList: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "#EDE6DC", border: "1px solid #C4A882", borderRadius: 4, overflow: "hidden", cursor: "pointer" },
  cardMain: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" },
  cardThumb: { width: 52, height: 52, objectFit: "cover", borderRadius: 2, flexShrink: 0, border: "1px solid #C4A882" },
  cardThumbEmpty: { width: 52, height: 52, borderRadius: 2, flexShrink: 0, border: "1px solid #C4A882", background: "#DDD5C8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#C4A882" },
  cardInfo: { flex: 1, display: "flex", flexDirection: "column", gap: 3 },
  cardTopRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardStock: { fontSize: 10, letterSpacing: "0.14em", color: "#8B5A2B", background: "#DDD0BB", borderRadius: 3, padding: "2px 7px", fontFamily: "monospace", flexShrink: 0 },
  cardColor: { fontSize: 15, color: "#1C1C1C", letterSpacing: "0.04em" },
  cardDims: { fontSize: 12, color: "#8B7355", letterSpacing: "0.06em" },
  cardJob: { fontSize: 11, color: "#8B5A2B", letterSpacing: "0.1em", textTransform: "uppercase" },
  cardAvail: { fontSize: 11, color: "#5A8B5A", letterSpacing: "0.1em", textTransform: "uppercase" },
  cardFlagged: { fontSize: 11, color: "#C0392B", letterSpacing: "0.1em", textTransform: "uppercase" },
  cardArrow: { fontSize: 22, color: "#C4A882", lineHeight: 1 },
  cardSelected: { borderColor: "#8B5A2B", background: "#E8DDD0" },
  checkbox: { width: 22, height: 22, borderRadius: 4, border: "1px solid #C4A882", background: "#F2EDE6", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  checkboxChecked: { background: "#8B5A2B", borderColor: "#8B5A2B" },
  checkboxTick: { fontSize: 13, color: "#F2EDE6", lineHeight: 1 },
  selectToggleBtn: { background: "none", border: "1px solid #8B5A2B", color: "#8B5A2B", borderRadius: 4, padding: "6px 16px", fontFamily: "inherit", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer", flexShrink: 0 },
  selectToolbar: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1C1C1C", borderRadius: 4, padding: "10px 16px", marginBottom: 14 },
  selectCount: { fontSize: 12, color: "#8B7355", letterSpacing: "0.12em" },
  dimFilterRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  dimFilterLabel: { fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8B7355", flexShrink: 0 },
  dimFilterInput: { flex: 1, padding: "9px 10px", fontSize: 13 },
  clearDimBtn: { background: "none", border: "none", color: "#8B5A2B", fontSize: 16, cursor: "pointer", padding: "4px 6px", flexShrink: 0 },
  dimFilterNote: { fontSize: 11, color: "#8B5A2B", letterSpacing: "0.08em", margin: "0 0 10px", fontStyle: "italic" },
  filterDropdownRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 },
  emptyMsg: { textAlign: "center", color: "#8B7355", fontSize: 14, letterSpacing: "0.08em", marginTop: 32, fontStyle: "italic" },
  newSlabTitle: { fontSize: 20, color: "#1C1C1C", margin: "0 0 4px", letterSpacing: "0.08em" },
  newSlabSub: { fontSize: 13, color: "#8B7355", margin: "0 0 20px", letterSpacing: "0.06em" },
  newSlabBadgeBox: { background: "#1C1C1C", borderRadius: 6, padding: "16px", marginBottom: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 },
  newSlabBadgeLabel: { fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8B7355" },
  newSlabBadge: { fontSize: 32, letterSpacing: "0.14em", color: "#E8D5B7", fontFamily: "monospace", fontWeight: "bold" },
  newSlabBadgeHint: { fontSize: 11, color: "#8B7355", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 },
  abandonRow: { display: "flex", alignItems: "center", gap: 8 },
  abandonPrompt: { fontSize: 13, color: "#8B7355", fontStyle: "italic" },
  abandonYes: { background: "#C0392B", color: "#F2EDE6", border: "none", borderRadius: 3, padding: "5px 12px", fontFamily: "inherit", fontSize: 12, letterSpacing: "0.1em", cursor: "pointer" },
  abandonNo: { background: "#EDE6DC", color: "#4A4A4A", border: "1px solid #C4A882", borderRadius: 3, padding: "5px 12px", fontFamily: "inherit", fontSize: 12, letterSpacing: "0.1em", cursor: "pointer" },
  progressTrack: { height: 4, background: "#DDD5C8", borderRadius: 2, marginBottom: 20, overflow: "hidden" },
  progressFill: { height: "100%", background: "#5A6E4A", borderRadius: 2, transition: "width 0.4s ease" },
  checkInstructions: { fontSize: 13, color: "#8B7355", fontStyle: "italic", letterSpacing: "0.04em", marginBottom: 20, lineHeight: 1.6 },
  checkEntryForm: { display: "flex", gap: 10, marginBottom: 8 },
  checkEntryInput: { flex: 1, fontSize: 18, letterSpacing: "0.12em", fontFamily: "monospace", textTransform: "uppercase" },
  checkEntryBtn: { background: "#5A6E4A", color: "#F2EDE6", border: "none", borderRadius: 4, padding: "0 20px", fontSize: 20, cursor: "pointer", flexShrink: 0 },
  checkError: { fontSize: 13, color: "#C0392B", letterSpacing: "0.06em", margin: "0 0 14px", fontStyle: "italic" },
  checkedSection: { marginTop: 24 },
  checkedHeading: { fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#5A6E4A", marginBottom: 10 },
  summaryGrid: { display: "flex", background: "#1C1C1C", borderRadius: 4, padding: "20px", marginBottom: 24, gap: 0 },
  summaryCell: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  summaryNum: { fontSize: 36, color: "#E8D5B7", fontWeight: "normal", letterSpacing: "0.04em" },
  summaryLabel: { fontSize: 10, color: "#8B7355", letterSpacing: "0.18em", textTransform: "uppercase" },
  summaryMissingTitle: { fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "#C0392B", margin: "0 0 10px" },
  summaryNote: { fontSize: 12, color: "#8B7355", fontStyle: "italic", marginBottom: 14, lineHeight: 1.6 },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", color: "#F2EDE6", padding: "12px 24px", borderRadius: 4, fontSize: 13, letterSpacing: "0.1em", zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  modal: { background: "#F2EDE6", borderRadius: 6, padding: "28px 24px", width: "100%", maxWidth: 340, textAlign: "center" },
  modalTitle: { fontSize: 18, color: "#1C1C1C", margin: "0 0 8px", letterSpacing: "0.06em" },
  modalSub: { fontSize: 13, color: "#8B7355", margin: "0 0 24px", letterSpacing: "0.06em" },
  modalBtns: { display: "flex", gap: 12 },
  modalCancel: { flex: 1, padding: "12px", background: "#EDE6DC", border: "1px solid #C4A882", borderRadius: 4, fontFamily: "inherit", fontSize: 13, letterSpacing: "0.1em", cursor: "pointer", color: "#4A4A4A" },
  modalConfirm: { flex: 1, padding: "12px", background: "#8B3A2B", border: "none", borderRadius: 4, fontFamily: "inherit", fontSize: 13, letterSpacing: "0.1em", cursor: "pointer", color: "#F2EDE6" },
};
