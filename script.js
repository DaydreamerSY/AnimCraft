/**
 * Animation Reference Creator 
 * Core Logic File
 */

// Basic State Management
gsap.registerPlugin(MotionPathPlugin);

const State = {
    shapes: [],           // All shape objects
    groups: [],           // Group objects { id, name, childIds, animations }
    selectedShapeId: null,// Currently active object ID
    selectedGroupId: null,// Currently active group ID
    isPlaying: false      // Global playback state
};

// V2.0 Engine Refactoring: OOP Actions & Easing Synthesis
const EasingMap = {
    'Linear': 'none',
    'Sine': 'sine',
    'Quad': 'power1',
    'Cubic': 'power2',
    'Quart': 'power3',
    'Quint': 'power4',
    'Expo': 'expo',
    'Circ': 'circ',
    'Back': 'back',
    'Elastic': 'elastic',
    'Bounce': 'bounce',
    'Spring': 'elastic.out(1, 0.4)'
};

class VFXHelpers {
    static getGSAPEase(transition, direction) {
        if (transition === 'Linear') return 'none';
        if (transition === 'Spring') return EasingMap['Spring'];
        
        const base = EasingMap[transition] || 'power1';
        
        if (direction === 'OutIn') {
            const easeOut = gsap.parseEase(`${base}.out`);
            const easeIn = gsap.parseEase(`${base}.in`);
            return function(t) {
                if(t < 0.5) return easeOut(t * 2) / 2;
                return easeIn((t - 0.5) * 2) / 2 + 0.5;
            };
        }
        
        let dir = 'inOut';
        if (direction === 'In') dir = 'in';
        if (direction === 'Out') dir = 'out';
        
        return `${base}.${dir}`;
    }
}

class BaseAction {
    constructor(id, type, step, duration, easeTransition, easeDirection) {
        this.id = id || 'anim_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        this.type = type;
        this.step = step || 1;
        this.duration = duration !== undefined ? parseFloat(duration) : 1.0;
        this.easeTransition = easeTransition || 'Linear'; 
        this.easeDirection = easeDirection || 'In'; 
        this.vfxEnabled = false;
        this.vfxTiming = 'before';
    }

    getGSAPEase() {
        return VFXHelpers.getGSAPEase(this.easeTransition, this.easeDirection);
    }

    buildTween(shape) { return null; }
    renderParamsUI(container, onChangeCallback) {}
    
    // For serialization
    toJSON() {
        return { ...this };
    }
}

class MoveAction extends BaseAction {
    constructor(data = {}) {
        super(data.id, 'move', data.step, data.duration, data.easeTransition, data.easeDirection);
        this.targetX = data.targetX || 0;
        this.targetY = data.targetY || 0;
        this.ctrlX = data.ctrlX;
        this.ctrlY = data.ctrlY;
        this.startX = data.startX;
        this.startY = data.startY;
        this.vfxEnabled = data.vfxEnabled || false;
        this.vfxTiming = data.vfxTiming || 'before';
        
        // Legacy ease string migration
        if (data.ease && typeof data.ease === 'string' && !data.easeTransition) {
             const parts = data.ease.split('.');
             // fallback to Quad InOut if old format is unsupported perfectly
             this.easeTransition = 'Linear';
             this.easeDirection = 'In';
        }
    }

    buildTween(shape) {
        let vars = {
            duration: this.duration,
            ease: this.getGSAPEase()
        };

        if (this.vfxEnabled) {
            let lastDropTime = 0;
            vars.onUpdate = () => {
                const now = Date.now();
                if(now - lastDropTime > 40) {
                    const c = shape.getCenter();
                    VFX.spawnTrailDrop(c.x, c.y, shape.color);
                    lastDropTime = now;
                }
            };
        }

        if (this.ctrlX !== undefined) {
            const proxy = { p: 0 };
            let P0x, P0y;
            const P1x = this.ctrlX;
            const P1y = this.ctrlY;
            const P2x = parseFloat(this.targetX);
            const P2y = parseFloat(this.targetY);
            
            const el = shape.el;
            const originalOnUpdate = vars.onUpdate;
            
            // Capture start position from live DOM when tween fires
            vars.onStart = function() {
                P0x = gsap.getProperty(el, "x");
                P0y = gsap.getProperty(el, "y");
            };
            
            vars.onUpdate = () => {
                if (P0x === undefined) return;
                const t = proxy.p;
                const x = Math.pow(1-t, 2)*P0x + 2*(1-t)*t*P1x + Math.pow(t, 2)*P2x;
                const y = Math.pow(1-t, 2)*P0y + 2*(1-t)*t*P1y + Math.pow(t, 2)*P2y;
                gsap.set(el, {x: x, y: y});
                if (originalOnUpdate) originalOnUpdate();
            };
            
            return gsap.to(proxy, { p: 1, ...vars });
        }
        
        vars.x = parseFloat(this.targetX);
        vars.y = parseFloat(this.targetY);
        return gsap.to(shape.el, vars);
    }

    renderParamsUI(container, onChange) {
        container.innerHTML = `
            <div>
                <label class="text-[10px] text-gray-400 block mb-1">Target X</label>
                <input type="number" id="spec-move-x" class="bg-gray-800 border-none text-white text-xs rounded px-2 py-1 w-full focus:ring-1 focus:ring-indigo-500" value="${this.targetX}" step="1" />
            </div>
            <div>
                <label class="text-[10px] text-gray-400 block mb-1">Target Y</label>
                <input type="number" id="spec-move-y" class="bg-gray-800 border-none text-white text-xs rounded px-2 py-1 w-full focus:ring-1 focus:ring-indigo-500" value="${this.targetY}" step="1" />
            </div>
        `;
        container.querySelector('#spec-move-x').addEventListener('change', e => { this.targetX = parseFloat(e.target.value); onChange(); });
        container.querySelector('#spec-move-y').addEventListener('change', e => { this.targetY = parseFloat(e.target.value); onChange(); });
    }
}

class ScaleAction extends BaseAction {
    constructor(data = {}) {
        super(data.id, 'scale', data.step, data.duration, data.easeTransition, data.easeDirection);
        // Support both legacy single targetScale and new scaleX/scaleY
        if (data.targetScaleX !== undefined || data.targetScaleY !== undefined) {
            this.targetScaleX = data.targetScaleX !== undefined ? data.targetScaleX : 1.5;
            this.targetScaleY = data.targetScaleY !== undefined ? data.targetScaleY : 1.5;
        } else {
            const s = data.targetScale !== undefined ? data.targetScale : 1.5;
            this.targetScaleX = s;
            this.targetScaleY = s;
        }
        this.vfxEnabled = data.vfxEnabled || false;
        this.vfxTiming = data.vfxTiming || 'before';
    }

    buildTween(shape) {
        let vars = {
            scaleX: parseFloat(this.targetScaleX),
            scaleY: parseFloat(this.targetScaleY),
            duration: this.duration,
            ease: this.getGSAPEase()
        };
        if (this.vfxEnabled) this._applyParticleBurst(shape, vars);
        return gsap.to(shape.el, vars);
    }

    _applyParticleBurst(shape, vars) {
        const triggerBurst = () => {
            const c = shape.getCenter();
            VFX.spawnBurst(c.x, c.y, shape.color);
        };
        if (this.vfxTiming === 'before' || !this.vfxTiming) vars.onStart = triggerBurst;
        else vars.onComplete = triggerBurst;
    }

    renderParamsUI(container, onChange) {
        container.innerHTML = `
            <div>
                <label class="text-[10px] text-gray-400 block mb-1">Scale X</label>
                <input type="number" id="spec-scale-x" class="bg-gray-800 border-none text-white text-xs rounded px-2 py-1 w-full focus:ring-1 focus:ring-indigo-500" value="${this.targetScaleX}" step="0.1" />
            </div>
            <div>
                <label class="text-[10px] text-gray-400 block mb-1">Scale Y</label>
                <input type="number" id="spec-scale-y" class="bg-gray-800 border-none text-white text-xs rounded px-2 py-1 w-full focus:ring-1 focus:ring-indigo-500" value="${this.targetScaleY}" step="0.1" />
            </div>
        `;
        container.querySelector('#spec-scale-x').addEventListener('change', e => { this.targetScaleX = parseFloat(e.target.value); onChange(); });
        container.querySelector('#spec-scale-y').addEventListener('change', e => { this.targetScaleY = parseFloat(e.target.value); onChange(); });
    }
}

class FadeAction extends BaseAction {
    constructor(data = {}) {
        super(data.id, 'fade', data.step, data.duration, data.easeTransition, data.easeDirection);
        this.targetOpacity = data.targetOpacity !== undefined ? data.targetOpacity : 0;
        this.vfxEnabled = data.vfxEnabled || false;
        this.vfxTiming = data.vfxTiming || 'before';
    }

    buildTween(shape) {
        let vars = {
            opacity: parseFloat(this.targetOpacity),
            duration: this.duration,
            ease: this.getGSAPEase()
        };
        if (this.vfxEnabled) {
            const triggerBurst = () => {
                const c = shape.getCenter();
                VFX.spawnBurst(c.x, c.y, shape.color);
            };
            if (this.vfxTiming === 'before' || !this.vfxTiming) vars.onStart = triggerBurst;
            else vars.onComplete = triggerBurst;
        }
        return gsap.to(shape.el, vars);
    }

    renderParamsUI(container, onChange) {
        container.innerHTML = `
            <div>
                <label class="text-[10px] text-gray-400 block mb-1">Target Opacity</label>
                <input type="number" id="spec-fade" class="bg-gray-800 border-none text-white text-xs rounded px-2 py-1 w-full focus:ring-1 focus:ring-indigo-500" value="${this.targetOpacity}" step="0.1" min="0" max="1" />
            </div>
        `;
        container.querySelector('#spec-fade').addEventListener('change', e => { this.targetOpacity = parseFloat(e.target.value); onChange(); });
    }
}

class BounceAction extends BaseAction {
    constructor(data = {}) {
        super(data.id, 'bounce', data.step, data.duration, data.easeTransition, data.easeDirection);
        this.vfxEnabled = data.vfxEnabled || false;
        this.vfxTiming = data.vfxTiming || 'before';
    }

    buildTween(shape) {
        const tl = gsap.timeline();
        
        let onStartFn = null;
        let onCompleteFn = null;
        if (this.vfxEnabled) {
            const triggerBurst = () => {
                const c = shape.getCenter();
                VFX.spawnBurst(c.x, c.y, shape.color);
            };
            if (this.vfxTiming === 'before' || !this.vfxTiming) onStartFn = triggerBurst;
            else onCompleteFn = triggerBurst;
        }
        
        if (onStartFn) tl.call(onStartFn);
        
        const mainEase = this.getGSAPEase();
        
        tl.to(shape.el, {
            scale: shape.scale * 1.5,
            duration: this.duration * 0.3,
            ease: "power2.out"
        }).to(shape.el, {
            scale: shape.scale,
            duration: this.duration * 0.7,
            ease: mainEase
        });
        
        if (onCompleteFn) tl.call(onCompleteFn);
        return tl;
    }

    renderParamsUI(container, onChange) {
        container.innerHTML = `<div class="col-span-2 text-[10px] text-gray-500 italic">Bouncing effect applies easing to the landing phase.</div>`;
    }
}

class RotateAction extends BaseAction {
    constructor(data = {}) {
        super(data.id, 'rotate', data.step, data.duration, data.easeTransition, data.easeDirection);
        this.targetRotation = data.targetRotation !== undefined ? data.targetRotation : 90;
        this.relative = data.relative || false;
        this.vfxEnabled = data.vfxEnabled || false;
        this.vfxTiming = data.vfxTiming || 'before';
    }

    buildTween(shape) {
        let rotVal = parseFloat(this.targetRotation);
        if (this.relative) {
            rotVal = '+=' + rotVal;
        }
        let vars = {
            rotation: rotVal,
            duration: this.duration,
            ease: this.getGSAPEase()
        };
        if (this.vfxEnabled) {
            const triggerBurst = () => {
                const c = shape.getCenter();
                VFX.spawnBurst(c.x, c.y, shape.color);
            };
            if (this.vfxTiming === 'before' || !this.vfxTiming) vars.onStart = triggerBurst;
            else vars.onComplete = triggerBurst;
        }
        return gsap.to(shape.el, vars);
    }

    renderParamsUI(container, onChange) {
        container.innerHTML = `
            <div>
                <label class="text-[10px] text-gray-400 block mb-1">Degrees</label>
                <input type="number" id="spec-rotate-deg" class="bg-gray-800 border-none text-white text-xs rounded px-2 py-1 w-full focus:ring-1 focus:ring-indigo-500" value="${this.targetRotation}" step="1" />
            </div>
            <div class="flex items-center gap-2 col-span-2">
                <label class="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" id="spec-rotate-relative" class="form-checkbox h-3 w-3 text-indigo-500 rounded border-gray-600 bg-gray-700" ${this.relative ? 'checked' : ''} />
                    <span class="text-[10px] text-gray-300">Relative (additive)</span>
                </label>
            </div>
        `;
        container.querySelector('#spec-rotate-deg').addEventListener('change', e => { this.targetRotation = parseFloat(e.target.value); onChange(); });
        container.querySelector('#spec-rotate-relative').addEventListener('change', e => { this.relative = e.target.checked; onChange(); });
    }
}

class ActionFactory {
    static create(data) {
        if (!data || !data.type) return null;
        switch(data.type) {
            case 'move': return new MoveAction(data);
            case 'scale': return new ScaleAction(data);
            case 'fade': return new FadeAction(data);
            case 'bounce': return new BounceAction(data);
            case 'rotate': return new RotateAction(data);
            default: return new BaseAction(data.id, data.type, data.step, data.duration, data.easeTransition, data.easeDirection);
        }
    }
}

// Shape class
class CanvasShape {
    constructor(id, type, x, y, options = {}) {
        this.id = id;
        this.type = type; // 'button', 'item', 'star'
        this.name = options.name || (type.charAt(0).toUpperCase() + type.slice(1) + ' ' + id.substring(6).toUpperCase());
        
        // Transform properties
        this.x = x;
        this.y = y;
        this.scaleX = 1.0;
        this.scaleY = 1.0;
        this.rotation = 0;
        this.color = options.color || this.getDefaultColor(type);
        this.opacity = 1.0;
        this.groupId = null; // reference to parent group
        
        // DOM Element
        this.el = null;
        
        // Animation sequences (DOTween style)
        this.animations = [];

        this.initDOM();
    }

    // Backward compat: get/set scale applies to both axes
    get scale() { return this.scaleX; }
    set scale(v) { this.scaleX = v; this.scaleY = v; }

    getDefaultColor(type) {
        if (type === 'button') return '#3b82f6'; // blue-500
        if (type === 'item') return '#f59e0b';   // amber-500
        if (type === 'star') return '#fbbf24';   // amber-400
        return '#6366f1'; // indigo
    }

    initDOM() {
        this.el = document.createElement('div');
        this.el.id = this.id;
        this.el.className = `shape-element shape-${this.type}`;
        this.el.dataset.id = this.id;
        
        this.applyIcon(); // Apply icon based on this.icon property
        this.applyTransform();
        this.applyColor();

        // Add to canvas
        document.getElementById('canvas-layer').appendChild(this.el);
        this.setupDragging();
    }

    applyTransform() {
        gsap.set(this.el, {
            x: this.x,
            y: this.y,
            scaleX: this.scaleX,
            scaleY: this.scaleY,
            rotation: this.rotation,
            opacity: this.opacity
        });
        updateTrajectories(); // redraw paths
    }

    applyColor() {
        this.el.style.backgroundColor = this.color;
    }

    applyIcon() {
        if (this.icon) {
            this.el.innerHTML = `<i class="ph-fill ${this.icon} text-2xl text-white drop-shadow-md"></i>`;
        } else {
            this.el.innerHTML = '';
        }
    }

    setupDragging() {
        let isDragging = false;
        let startX, startY;
        let initialPositions = [];

        this.el.addEventListener('mousedown', (e) => {
            let isPartIfSelectedGroup = false;
            if (State.selectedGroupId) {
                const grpAllCh = getGroupAllChildren(getGroup(State.selectedGroupId));
                if (grpAllCh.includes(this.id)) isPartIfSelectedGroup = true;
            }

            if (!isPartIfSelectedGroup) {
                selectShape(this.id);
                initialPositions = [{ shape: this, initialX: this.x, initialY: this.y }];
            } else {
                // Drag the whole group
                const grpAllCh = getGroupAllChildren(getGroup(State.selectedGroupId));
                initialPositions = grpAllCh.map(cid => {
                    const s = getShape(cid);
                    return s ? { shape: s, initialX: s.x, initialY: s.y } : null;
                }).filter(Boolean);
            }
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            this.el.style.cursor = 'grabbing';
            e.stopPropagation();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            initialPositions.forEach(pos => {
                pos.shape.x = pos.initialX + dx;
                pos.shape.y = pos.initialY + dy;
                pos.shape.applyTransform();
            });
            
            if (State.selectedShapeId === this.id && initialPositions.length === 1) {
                document.getElementById('prop-x').value = Math.round(this.x);
                document.getElementById('prop-y').value = Math.round(this.y);
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                this.el.style.cursor = 'grab';
            }
        });
    }

    // Get center point relative to canvas-layer (used by VFX)
    getCenter() {
        const rect = this.el.getBoundingClientRect();
        const parentRect = document.getElementById('canvas-layer').getBoundingClientRect();
        return {
            x: rect.left - parentRect.left + rect.width / 2,
            y: rect.top - parentRect.top + rect.height / 2
        };
    }

    // Delegate tween building to each Action's own buildTween(shape)
    buildTween(anim) {
        // Ensure the object is a proper Action instance (for legacy plain objects)
        if (typeof anim.buildTween !== 'function') {
            anim = ActionFactory.create(anim);
        }
        if (!anim) return null;
        return anim.buildTween(this);
    }
}

// Global Node Drag State
let draggingMoveAnim = null;
let draggingMoveShape = null;
let draggingMoveCX = 0;
let draggingMoveCY = 0;
let draggingCtrlAnim = null;

// ----------------------------------------------------
// App Initialization & UI Setup
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Toolbar buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.shape;
            addNewShape(type);
        });
    });

    // Canvas background click (Deselect)
    document.getElementById('canvas-container').addEventListener('mousedown', (e) => {
        if (e.target.id === 'canvas-grid' || e.target.id === 'canvas-container' || e.target.id === 'trajectory-svg') {
            selectShape(null);
        }
    });

    // Timeline Resizer Logic
    const timelineSection = document.getElementById('timeline-section');
    const timelineResizer = document.getElementById('timeline-resizer');
    let isResizingTimeline = false;

    if (timelineResizer && timelineSection) {
        timelineResizer.addEventListener('mousedown', (e) => {
            isResizingTimeline = true;
            document.body.style.cursor = 'ns-resize';
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isResizingTimeline) return;
            const containerBox = document.body.getBoundingClientRect();
            const newHeight = containerBox.bottom - e.clientY;
            if (newHeight > 100 && newHeight < containerBox.height * 0.8) {
                timelineSection.style.height = newHeight + 'px';
            }
        });

        window.addEventListener('mouseup', () => {
            if (isResizingTimeline) {
                isResizingTimeline = false;
                document.body.style.cursor = 'default';
                updateTrajectories();
            }
        });
    }

    // Global Play Toggle
    document.getElementById('btn-play-toggle').addEventListener('click', () => {
        if (State.isPlaying) {
            stopAll();
        } else {
            playAll();
        }
    });
    
    // File Export UI...
    document.getElementById('btn-export').addEventListener('click', showExport);
    document.getElementById('btn-import-modal').addEventListener('click', showImportModal);
    document.getElementById('btn-import-file').addEventListener('change', importJsonFile);
    document.getElementById('btn-apply-json').addEventListener('click', applyJsonText);
    document.getElementById('close-modal').addEventListener('click', hideExport);
    document.getElementById('btn-copy-json').addEventListener('click', copyJson);
    document.getElementById('btn-download-json').addEventListener('click', downloadJson);

    // New Group button
    document.getElementById('btn-add-group').addEventListener('click', addNewGroup);

    // Help Modal
    const helpModal = document.getElementById('help-modal');
    const openHelp = () => {
        helpModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            helpModal.classList.add('opacity-100');
            helpModal.querySelector('div').classList.remove('scale-95');
            helpModal.querySelector('div').classList.add('scale-100');
        });
    };
    const closeHelp = () => {
        helpModal.classList.remove('opacity-100');
        helpModal.querySelector('div').classList.remove('scale-100');
        helpModal.querySelector('div').classList.add('scale-95');
        setTimeout(() => helpModal.classList.add('hidden'), 200);
    };
    document.getElementById('btn-help').addEventListener('click', openHelp);
    document.getElementById('close-help-modal').addEventListener('click', closeHelp);
    document.getElementById('close-help-modal-footer').addEventListener('click', closeHelp);
    helpModal.addEventListener('click', (e) => { if (e.target === helpModal) closeHelp(); });
    
    setupInspectorEvents();

    // Global Node Drag Move Logic
    window.addEventListener('mousemove', (e) => {
        const containerBox = document.getElementById('canvas-container').getBoundingClientRect();
        if(draggingMoveAnim) {
            draggingMoveAnim.targetX = e.clientX - containerBox.left - draggingMoveCX;
            draggingMoveAnim.targetY = e.clientY - containerBox.top - draggingMoveCY;
            updateTrajectories();
        } else if (draggingCtrlAnim) {
            draggingCtrlAnim.ctrlX = e.clientX - containerBox.left - draggingMoveCX;
            draggingCtrlAnim.ctrlY = e.clientY - containerBox.top - draggingMoveCY;
            updateTrajectories();
        }
    });

    window.addEventListener('mouseup', () => {
        if(draggingMoveAnim || draggingCtrlAnim) {
            if(State.selectedShapeId === draggingMoveShape?.id) renderAnimationList(draggingMoveShape);
            draggingMoveAnim = null;
            draggingCtrlAnim = null;
            draggingMoveShape = null;
            document.body.style.cursor = 'default';
        }
    });
});

// ----------------------------------------------------
// Core Functions
// ----------------------------------------------------

function generateId() {
    return 'shape_' + Math.random().toString(36).substr(2, 9);
}

function generateGroupId() {
    return 'grp_' + Math.random().toString(36).substr(2, 9);
}

function addNewShape(type) {
    const id = generateId();
    // Default position center canvas
    const container = document.getElementById('canvas-container');
    const x = container.clientWidth / 2 - 40;
    const y = container.clientHeight / 2 - 40;

    const shape = new CanvasShape(id, type, x, y);
    State.shapes.push(shape);
    
    selectShape(id);
    renderOutliner();
}

function addNewGroup() {
    const id = generateGroupId();
    const grp = {
        id,
        name: 'Group ' + (State.groups.length + 1),
        childIds: [],
        parentGroupId: null,
        animations: []
    };
    State.groups.push(grp);
    renderOutliner();
    selectGroup(id);
}

// Returns true if candidateAncestorId is an ancestor of targetGroupId (cycle detection)
function isGroupAncestor(candidateAncestorId, targetGroupId) {
    let cur = getGroup(targetGroupId);
    while (cur) {
        if (cur.id === candidateAncestorId) return true;
        cur = getGroup(cur.parentGroupId);
    }
    return false;
}

// Recursively collect all leaf shape IDs for a group (including nested groups)
function getGroupAllChildren(grp) {
    const result = [];
    grp.childIds.forEach(childId => {
        if (getShape(childId)) result.push(childId);
    });
    State.groups.forEach(child => {
        if (child.parentGroupId === grp.id) {
            result.push(...getGroupAllChildren(child));
        }
    });
    return result;
}

function getShape(id) {
    return State.shapes.find(s => s.id === id);
}

function getGroup(id) {
    return State.groups.find(g => g.id === id);
}

function selectGroup(id) {
    State.selectedGroupId = id;
    State.selectedShapeId = null;

    document.querySelectorAll('.shape-element').forEach(el => el.classList.remove('selected'));

    const inspector = document.getElementById('inspector-panel');
    const placeholder = document.getElementById('inspector-placeholder');

    if (id) {
        const grp = getGroup(id);
        const allChildIds = getGroupAllChildren(grp);
        document.querySelectorAll('.shape-element').forEach(el => {
            if (allChildIds.includes(el.dataset.id)) el.classList.add('selected');
        });

        inspector.classList.remove('hidden');
        placeholder.classList.add('hidden');
        populateGroupInspector(grp);
    } else {
        inspector.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }
    renderOutliner();
    renderTimelineOverview();
}

function selectShape(id) {
    State.selectedShapeId = id;
    State.selectedGroupId = null;

    // Update styling
    document.querySelectorAll('.shape-element').forEach(el => {
        if (el.id === id) el.classList.add('selected');
        else el.classList.remove('selected');
    });

    const inspector = document.getElementById('inspector-panel');
    const placeholder = document.getElementById('inspector-placeholder');

    if (id) {
        inspector.classList.remove('hidden');
        placeholder.classList.add('hidden');
        populateInspector(getShape(id));
    } else {
        inspector.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }

    updateTrajectories();
    renderOutliner();
    renderTimelineOverview();
}

// ----------------------------------------------------
// Inspector UI & Outliner UI
// ----------------------------------------------------

function renderOutliner() {
    const list = document.getElementById('outliner-list');
    const emptyUI = document.getElementById('empty-outliner');
    
    // Clear non-empty items
    Array.from(list.children).forEach(c => {
        if(c.id !== 'empty-outliner') c.remove();
    });

    const totalItems = State.shapes.length + State.groups.length;
    if(totalItems === 0) {
        emptyUI.style.display = 'block';
        return;
    }
    emptyUI.style.display = 'none';

    // Helper: build a rename-able row
    const makeRow = (id, isGroup, label, iconClass, isSelected, colorCls, onClick, onRename) => {
        const item = document.createElement('div');
        item.className = `group flex items-center justify-between p-2 rounded cursor-pointer transition-colors border ${
            isSelected ? 'bg-indigo-600 text-white border-indigo-500' : `${colorCls} text-gray-300 hover:bg-gray-700 border-transparent`
        }`;
        item.innerHTML = `
            <div class="flex items-center gap-2 flex-1 min-w-0">
                <i class="ph ${iconClass} ${isSelected ? 'text-indigo-200' : 'text-gray-500'}"></i>
                <span class="text-xs font-medium truncate flex-1 row-name-display">${label}</span>
                <input type="text" class="text-xs text-black hidden w-full px-1 flex-1 rounded row-name-input outline-none ring-1 ring-indigo-500" value="${label}" />
                <div class="flex flex-col ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="hover:text-white text-gray-400 p-0 leading-none btn-move-up" title="Move Up"><i class="ph ph-caret-up text-[10px]"></i></button>
                    <button class="hover:text-white text-gray-400 p-0 leading-none btn-move-down" title="Move Down"><i class="ph ph-caret-down text-[10px]"></i></button>
                </div>
            </div>
        `;
        item.addEventListener('click', (e) => { if(e.target.tagName !== 'INPUT' && !e.target.closest('button')) onClick(); });
        
        item.querySelector('.btn-move-up').addEventListener('click', (e) => { e.stopPropagation(); moveItem(id, isGroup, 'up'); });
        item.querySelector('.btn-move-down').addEventListener('click', (e) => { e.stopPropagation(); moveItem(id, isGroup, 'down'); });
        
        const display = item.querySelector('.row-name-display');
        const input = item.querySelector('.row-name-input');
        item.addEventListener('dblclick', () => {
            display.classList.add('hidden');
            input.classList.remove('hidden');
            input.focus(); input.select();
        });
        const saveRename = () => {
            if(input.value.trim()) onRename(input.value.trim());
            renderOutliner();
        };
        input.addEventListener('blur', saveRename);
        input.addEventListener('keydown', e => { if(e.key === 'Enter') input.blur(); });
        return item;
    };

    // Render groups (top-level groups first, then nested)
    const renderGroup = (grp, depth) => {
        const isSelected = State.selectedGroupId === grp.id;
        const grpRow = makeRow(
            grp.id, true, grp.name, 'ph-folder', isSelected, 'bg-gray-800',
            () => selectGroup(grp.id),
            (name) => { grp.name = name; }
        );
        if (depth > 0) {
            grpRow.style.marginLeft = (depth * 14) + 'px';
            grpRow.style.paddingLeft = '8px';
            grpRow.style.borderLeft = '2px solid #7c3aed';
        }
        const badge = document.createElement('span');
        badge.className = `text-[9px] px-1.5 py-0.5 rounded-full ml-auto mr-1 ${isSelected ? 'bg-indigo-400/40 text-indigo-100' : 'bg-gray-700 text-gray-400'}`;
        const nestedCount = State.groups.filter(g => g.parentGroupId === grp.id).length;
        badge.textContent = grp.animations.length + ' anim' + (nestedCount ? ` / ${nestedCount} sub` : '');
        grpRow.firstElementChild.appendChild(badge);
        list.appendChild(grpRow);

        // Nested child groups
        State.groups.filter(g => g.parentGroupId === grp.id).forEach(childGrp => renderGroup(childGrp, depth + 1));

        // Direct child shapes
        grp.childIds.forEach(childId => {
            const shape = getShape(childId);
            if(!shape) return;
            const isChildSelected = State.selectedShapeId === shape.id;
            let childIcon = 'ph-rectangle';
            if(shape.type === 'item') childIcon = 'ph-circle';
            const childRow = makeRow(
                shape.id, false, shape.name, childIcon, isChildSelected, 'bg-gray-800/60',
                () => selectShape(shape.id),
                (name) => { shape.name = name; }
            );
            childRow.style.marginLeft = ((depth + 1) * 14) + 'px';
            childRow.style.paddingLeft = '8px';
            childRow.style.borderLeft = '2px solid #4f46e5';
            list.appendChild(childRow);
        });
    };

    // Render root groups (no parent)
    State.groups.filter(g => !g.parentGroupId).forEach(grp => renderGroup(grp, 0));

    // Render un-grouped shapes
    State.shapes.forEach(shape => {
        if(shape.groupId) return; // already shown under group
        const isSelected = State.selectedShapeId === shape.id;
        let iconClass = 'ph-rectangle';
        if(shape.type === 'item') iconClass = 'ph-circle';
        if(shape.type === 'star') iconClass = 'ph-star';
        const item = makeRow(
            shape.id, false, shape.name, iconClass, isSelected, 'bg-gray-800',
            () => selectShape(shape.id),
            (name) => { shape.name = name; }
        );
        list.appendChild(item);
    });

    updateZIndices();
}

function updateZIndices() {
    let z = 1;
    const setZ = (id) => {
        const s = getShape(id);
        if(s && s.el) { s.el.style.zIndex = z++; }
    };

    const traverseGroup = (grp) => {
        State.groups.filter(g => g.parentGroupId === grp.id).forEach(traverseGroup);
        grp.childIds.forEach(setZ);
    };

    State.groups.filter(g => !g.parentGroupId).forEach(traverseGroup);
    State.shapes.forEach(shape => {
        if(!shape.groupId) setZ(shape.id);
    });
}

function moveItem(id, isGroup, dir) {
    const swap = (arr, i, j) => {
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    };

    if (isGroup) {
        const grp = getGroup(id);
        const siblings = State.groups.filter(g => g.parentGroupId === grp.parentGroupId);
        const idx = siblings.findIndex(g => g.id === id);
        
        if (dir === 'up' && idx > 0) {
            const swapWithId = siblings[idx - 1].id;
            const global1 = State.groups.findIndex(g => g.id === id);
            const global2 = State.groups.findIndex(g => g.id === swapWithId);
            swap(State.groups, global1, global2);
        } else if (dir === 'down' && idx < siblings.length - 1) {
            const swapWithId = siblings[idx + 1].id;
            const global1 = State.groups.findIndex(g => g.id === id);
            const global2 = State.groups.findIndex(g => g.id === swapWithId);
            swap(State.groups, global1, global2);
        }
    } else {
        const shape = getShape(id);
        if (shape.groupId) {
            const grp = getGroup(shape.groupId);
            const idx = grp.childIds.indexOf(id);
            if (dir === 'up' && idx > 0) swap(grp.childIds, idx, idx - 1);
            else if (dir === 'down' && idx < grp.childIds.length - 1) swap(grp.childIds, idx, idx + 1);
        } else {
            const siblings = State.shapes.filter(s => !s.groupId);
            const idx = siblings.findIndex(s => s.id === id);
            
            if (dir === 'up' && idx > 0) {
                const swapWithId = siblings[idx - 1].id;
                const global1 = State.shapes.findIndex(s => s.id === id);
                const global2 = State.shapes.findIndex(s => s.id === swapWithId);
                swap(State.shapes, global1, global2);
            } else if (dir === 'down' && idx < siblings.length - 1) {
                const swapWithId = siblings[idx + 1].id;
                const global1 = State.shapes.findIndex(s => s.id === id);
                const global2 = State.shapes.findIndex(s => s.id === swapWithId);
                swap(State.shapes, global1, global2);
            }
        }
    }
    renderOutliner();
}

function renderTimelineOverview() {
    const container = document.getElementById('timeline-tracks');
    if(!container) return;
    
    const grouped = {};
    let hasAnims = false;

    // Individual shapes
    State.shapes.forEach(shape => {
        shape.animations.forEach(anim => {
            const s = Number(anim.step) || 1;
            if(!grouped[s]) grouped[s] = [];
            grouped[s].push({ label: shape.name, anim, id: shape.id, isGroup: false });
            hasAnims = true;
        });
    });
    // Groups
    State.groups.forEach(grp => {
        grp.animations.forEach(anim => {
            const s = Number(anim.step) || 1;
            if(!grouped[s]) grouped[s] = [];
            grouped[s].push({ label: `📁 ${grp.name}`, anim, id: grp.id, isGroup: true });
            hasAnims = true;
        });
    });

    if(!hasAnims) {
        container.innerHTML = '<div class="text-gray-500 text-xs italic w-full text-center mt-8">No animations added yet.</div>';
        return;
    }

    container.innerHTML = '';
    const steps = Object.keys(grouped).map(Number).sort((a,b)=>a-b);
    
    steps.forEach(step => {
        const stepCol = document.createElement('div');
        stepCol.className = 'w-48 flex-shrink-0 bg-gray-900/50 rounded-lg border border-gray-700 flex flex-col overflow-hidden shadow-sm';
        
        const header = document.createElement('div');
        header.className = 'bg-gray-700/80 px-3 py-1.5 border-b border-gray-600 text-[11px] font-bold text-indigo-300';
        header.textContent = `Sequence Step ${step}`;
        stepCol.appendChild(header);

        const listEl = document.createElement('div');
        listEl.className = 'p-2 space-y-2 overflow-y-auto flex-1';
        
        grouped[step].forEach(({label, anim, id, isGroup}) => {
            const card = document.createElement('div');
            const isActive = isGroup ? State.selectedGroupId === id : State.selectedShapeId === id;
            card.className = `bg-gray-800 border ${isActive ? 'border-indigo-400' : 'border-gray-600 hover:border-indigo-500'} rounded p-2 text-[10px] cursor-pointer transition-colors`;
            card.innerHTML = `
                <div class="font-bold text-gray-200 mb-1 truncate">${label}</div>
                <div class="text-gray-400 flex justify-between items-center">
                    <span class="uppercase font-semibold tracking-wide text-[9px] text-gray-300 bg-gray-700 px-1 py-0.5 rounded">${anim.type}</span>
                    <span>${anim.duration}s</span>
                </div>
            `;
            card.addEventListener('click', () => {
                if(isGroup) selectGroup(id);
                else selectShape(id);
            });
            listEl.appendChild(card);
        });
        
        stepCol.appendChild(listEl);
        container.appendChild(stepCol);
    });
}

function setupInspectorEvents() {
    const id = () => State.selectedShapeId;

    // Name change
    document.getElementById('prop-name').addEventListener('change', (e) => {
        const s = getShape(id());
        if (s && e.target.value.trim() !== '') {
            s.name = e.target.value.trim();
            renderOutliner();
            renderTimelineOverview();
        }
    });

    // Property changes
    document.getElementById('prop-x').addEventListener('change', (e) => {
        const s = getShape(id());
        if (s) { s.x = parseFloat(e.target.value); s.applyTransform(); }
    });
    document.getElementById('prop-y').addEventListener('change', (e) => {
        const s = getShape(id());
        if (s) { s.y = parseFloat(e.target.value); s.applyTransform(); }
    });
    document.getElementById('prop-scale-x').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        if (id()) {
            const s = getShape(id());
            if (s) { s.scaleX = val; s.applyTransform(); }
        } else if (State.selectedGroupId && !isNaN(val)) {
            const grpAllCh = getGroupAllChildren(getGroup(State.selectedGroupId));
            grpAllCh.forEach(cid => {
                const child = getShape(cid);
                if (child) { child.scaleX *= val; child.applyTransform(); }
            });
            e.target.value = '';
        }
    });
    document.getElementById('prop-scale-y').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        if (id()) {
            const s = getShape(id());
            if (s) { s.scaleY = val; s.applyTransform(); }
        } else if (State.selectedGroupId && !isNaN(val)) {
            const grpAllCh = getGroupAllChildren(getGroup(State.selectedGroupId));
            grpAllCh.forEach(cid => {
                const child = getShape(cid);
                if (child) { child.scaleY *= val; child.applyTransform(); }
            });
            e.target.value = '';
        }
    });
    document.getElementById('prop-rotation').addEventListener('change', (e) => {
        const s = getShape(id());
        if (s) { s.rotation = parseFloat(e.target.value); s.applyTransform(); }
    });
    document.getElementById('prop-opacity').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        if (id()) {
            const s = getShape(id());
            if (s) { s.opacity = val; s.applyTransform(); }
        } else if (State.selectedGroupId && !isNaN(val)) {
            const grpAllCh = getGroupAllChildren(getGroup(State.selectedGroupId));
            grpAllCh.forEach(cid => {
                const child = getShape(cid);
                if (child) { child.opacity = val; child.applyTransform(); }
            });
            e.target.value = '';
        }
    });
    document.getElementById('prop-color').addEventListener('input', (e) => {
        const s = getShape(id());
        if (s) { s.color = e.target.value; s.applyColor(); }
    });
    document.getElementById('prop-icon').addEventListener('change', (e) => {
        const s = getShape(id());
        if (s) { s.icon = e.target.value; s.applyIcon(); }
    });

    // Group assignment
    document.getElementById('prop-group-assign').addEventListener('change', (e) => {
        const s = getShape(id());
        if (!s) return;
        const gid = e.target.value || null;
        // remove from old group
        State.groups.forEach(g => { g.childIds = g.childIds.filter(c => c !== s.id); });
        s.groupId = gid;
        if (gid) {
            const grp = getGroup(gid);
            if (grp && !grp.childIds.includes(s.id)) grp.childIds.push(s.id);
        }
        populateInspector(s);
        renderOutliner();
        renderTimelineOverview();
    });

    document.getElementById('btn-duplicate-shape').addEventListener('click', () => {
        const sid = id();
        if(!sid) return;
        const original = getShape(sid);
        
        const newId = generateId();
        const clone = new CanvasShape(newId, original.type, original.x + 30, original.y + 30, {
            name: `${original.name} (Copy)`,
            color: original.color,
            icon: original.icon
        });
        clone.scaleX = original.scaleX;
        clone.scaleY = original.scaleY;
        clone.rotation = original.rotation || 0;
        clone.opacity = original.opacity !== undefined ? original.opacity : 1;
        clone.applyTransform();
        clone.applyColor();
        clone.applyIcon();

        // Deep copy animations with new IDs via ActionFactory
        clone.animations = original.animations.map(a => {
            const data = (typeof a.toJSON === 'function') ? a.toJSON() : { ...a };
            data.id = `anim_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
            return ActionFactory.create(data);
        }).filter(Boolean);

        State.shapes.push(clone);
        renderOutliner();
        renderTimelineOverview();
        updateTrajectories();
        selectShape(newId);
    });

    document.getElementById('btn-delete-shape').addEventListener('click', () => {
        const sid = id();
        if(!sid) return;
        const s = getShape(sid);
        s.el.remove();
        State.shapes = State.shapes.filter(x => x.id !== sid);
        selectShape(null);
    });

    document.getElementById('btn-add-anim').addEventListener('click', () => {
        // Works for both a selected shape and a selected group
        const s = getShape(id());
        const grp = !s ? getGroup(State.selectedGroupId) : null;
        const target = s || grp;
        if(!target) return;

        let maxStep = 0;
        State.shapes.forEach(sh => { sh.animations.forEach(a => { if (a.step > maxStep) maxStep = a.step; }); });
        State.groups.forEach(g => { g.animations.forEach(a => { if (a.step > maxStep) maxStep = a.step; }); });
        const newStep = maxStep > 0 ? maxStep + 1 : 1;

        // Default target: last move target + 100 offset, or init pos + 100
        let lastX = s ? s.x : 0;
        let lastY = s ? s.y : 0;
        const moveAnims = target.animations.filter(a => a.type === 'move');
        if (moveAnims.length > 0) {
            const last = moveAnims[moveAnims.length - 1];
            lastX = last.targetX;
            lastY = last.targetY;
        }

        const startX = lastX + 100;
        const startY = lastY;

        target.animations.push(new MoveAction({
            step: newStep,
            targetX: startX,
            targetY: startY,
            duration: 1.0,
            easeTransition: 'Linear',
            easeDirection: 'In'
        }));
        
        if (s) renderAnimationList(s);
        else renderAnimationList(grp);
        updateTrajectories();
    });

    document.getElementById('close-inspector').addEventListener('click', () => {
        selectShape(null);
    });
}

function populateGroupInspector(grp) {
    const allChildCount = getGroupAllChildren(grp).length;
    const nestedGroupCount = State.groups.filter(g => g.parentGroupId === grp.id).length;
    document.getElementById('prop-name').value = grp.name;
    document.getElementById('selected-shape-type').textContent = `GROUP · ${grp.childIds.length} shapes, ${nestedGroupCount} sub-groups`;
    document.getElementById('prop-x').value = '';
    document.getElementById('prop-y').value = '';
    document.getElementById('prop-scale-x').value = '';
    document.getElementById('prop-scale-y').value = '';
    document.getElementById('prop-rotation').value = '';
    document.getElementById('prop-opacity').value = '';
    document.getElementById('prop-color').value = '#6366f1';
    
    const iconSelect = document.getElementById('prop-icon');
    if (iconSelect) { iconSelect.value = ''; iconSelect.disabled = true; }

    // Parent group dropdown (excluding self, ancestors to prevent cycles)
    const groupSelect = document.getElementById('prop-group-assign');
    if (groupSelect) {
        groupSelect.innerHTML = '<option value="">No Parent Group</option>' +
            State.groups
                .filter(g => g.id !== grp.id && !isGroupAncestor(g.id, grp.id))
                .map(g => `<option value="${g.id}" ${grp.parentGroupId === g.id ? 'selected' : ''}>${g.name}</option>`)
                .join('');

        groupSelect.removeEventListener('change', groupSelect._grpParentHandler);
        groupSelect._grpParentHandler = (e) => {
            const newParentId = e.target.value || null;
            // Remove from old parent's childGroup tracking (we use parentGroupId, not childIds for groups)
            grp.parentGroupId = newParentId;
            populateGroupInspector(grp);
            renderOutliner();
        };
        groupSelect.addEventListener('change', groupSelect._grpParentHandler);
    }

    // Name change
    const nameInput = document.getElementById('prop-name');
    nameInput.removeEventListener('change', nameInput._grpHandler);
    nameInput._grpHandler = (e) => {
        if (e.target.value.trim() !== '') { grp.name = e.target.value.trim(); renderOutliner(); }
    };
    nameInput.addEventListener('change', nameInput._grpHandler);

    // Delete group button
    const delBtn = document.getElementById('btn-delete-shape');
    delBtn.innerHTML = '<i class="ph ph-trash"></i> Delete Group';
    delBtn.onclick = () => {
        grp.childIds.forEach(cid => { const sh = getShape(cid); if(sh) sh.groupId = null; });
        State.groups.forEach(g => { if(g.parentGroupId === grp.id) g.parentGroupId = null; });
        State.groups = State.groups.filter(g => g.id !== grp.id);
        selectGroup(null);
    };

    renderAnimationList(grp);
}

function populateInspector(shape) {
    const nameInput = document.getElementById('prop-name');
    if (nameInput._grpHandler) {
        nameInput.removeEventListener('change', nameInput._grpHandler);
        nameInput._grpHandler = null;
    }
    nameInput.value = shape.name;
    document.getElementById('selected-shape-type').textContent = `Type: ${shape.type.toUpperCase()}${shape.groupId ? ' · ' + (State.groups.find(g=>g.id===shape.groupId)?.name||'Group') : ''}`;
    document.getElementById('prop-x').value = Math.round(shape.x);
    document.getElementById('prop-y').value = Math.round(shape.y);
    document.getElementById('prop-scale-x').value = shape.scaleX;
    document.getElementById('prop-scale-y').value = shape.scaleY;
    document.getElementById('prop-rotation').value = shape.rotation || 0;
    document.getElementById('prop-opacity').value = shape.opacity || 1;
    document.getElementById('prop-color').value = shape.color;
    
    const iconSelect = document.getElementById('prop-icon');
    if (iconSelect) { 
        iconSelect.disabled = false;
        iconSelect.value = shape.icon || '';
    }

    // Update group assignment dropdown
    const groupSelect = document.getElementById('prop-group-assign');
    if (groupSelect) {
        // Clear any leftover handler from populateGroupInspector
        if (groupSelect._grpParentHandler) {
            groupSelect.removeEventListener('change', groupSelect._grpParentHandler);
            groupSelect._grpParentHandler = null;
        }
        
        groupSelect.innerHTML = '<option value="">No Group</option>' +
            State.groups.map(g => `<option value="${g.id}" ${shape.groupId === g.id ? 'selected' : ''}>${g.name}</option>`).join('');
    }

    renderAnimationList(shape);
}

function renderAnimationList(shape) {
    const container = document.getElementById('animation-list');
    const emptyUI = document.getElementById('empty-anim');
    
    Array.from(container.children).forEach(c => {
        if(c.id !== 'empty-anim') c.remove();
    });

    if (shape.animations.length === 0) {
        emptyUI.style.display = 'block';
        return;
    }
    
    emptyUI.style.display = 'none';
    const template = document.getElementById('anim-step-template');

    const TRANSITIONS = ['Linear','Sine','Quad','Cubic','Quart','Quint','Expo','Circ','Back','Elastic','Bounce','Spring'];
    const DIRECTIONS = ['In','Out','InOut','OutIn'];

    shape.animations.forEach((animRaw, index) => {
        // Upgrade plain object to Action if needed
        if (typeof animRaw.buildTween !== 'function') {
            shape.animations[index] = ActionFactory.create(animRaw);
        }
        const anim = shape.animations[index];

        const clone = template.content.cloneNode(true);
        const stepEl = clone.querySelector('.anim-step');
        
        // Type selector
        const typeSelect = clone.querySelector('.spec-type');
        typeSelect.value = anim.type;
        clone.querySelector('.anim-type-label').textContent = typeSelect.options[typeSelect.selectedIndex].text;

        // Duration
        clone.querySelector('.spec-duration').value = anim.duration;
        clone.querySelector('.spec-step').value = anim.step || 1;

        // Godot-style Transition + Direction selects (replace old .spec-ease)
        const easeContainer = clone.querySelector('.ease-selects-container');
        if (easeContainer) {
            const transSelect = easeContainer.querySelector('.spec-transition');
            const dirSelect = easeContainer.querySelector('.spec-direction');

            TRANSITIONS.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t; opt.textContent = t;
                if (t === anim.easeTransition) opt.selected = true;
                transSelect.appendChild(opt);
            });
            DIRECTIONS.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d; opt.textContent = d;
                if (d === anim.easeDirection) opt.selected = true;
                dirSelect.appendChild(opt);
            });

            transSelect.addEventListener('change', e => { anim.easeTransition = e.target.value; updateTrajectories(); });
            dirSelect.addEventListener('change', e => { anim.easeDirection = e.target.value; updateTrajectories(); });
        }

        // Inject dynamic params via OOP
        const paramsContainer = clone.querySelector('.anim-params');
        anim.renderParamsUI(paramsContainer, () => updateTrajectories());

        // Type change
        typeSelect.addEventListener('change', (e) => {
            const newType = e.target.value;
            const newAnim = ActionFactory.create({
                id: anim.id,
                type: newType,
                step: anim.step,
                duration: anim.duration,
                easeTransition: anim.easeTransition,
                easeDirection: anim.easeDirection,
                targetX: (shape.x || 0) + 100, targetY: (shape.y || 0),
                targetScaleX: 1.5, targetScaleY: 1.5, targetOpacity: 0, targetRotation: 90
            });
            shape.animations[index] = newAnim;
            renderAnimationList(shape);
            updateTrajectories();
        });

        clone.querySelector('.spec-duration').addEventListener('change', e => { anim.duration = parseFloat(e.target.value); });
        clone.querySelector('.spec-step').addEventListener('change', e => { anim.step = parseInt(e.target.value); renderTimelineOverview(); });

        // Play single step — tween FROM current DOM state (no reset)
        clone.querySelector('.btn-play-step').addEventListener('click', () => {
            if (!shape.el) return; // group nodes have no el
            gsap.killTweensOf(shape.el);
            shape.buildTween(anim);
        });

        // Delete step
        clone.querySelector('.btn-remove-step').addEventListener('click', () => {
            shape.animations.splice(index, 1);
            renderAnimationList(shape);
            updateTrajectories();
        });

        // VFX Particle UI
        const particleUI = document.createElement('div');
        particleUI.className = 'mt-3 p-2 bg-gray-900 rounded border border-gray-700 text-xs shadow-inner';
        const isMove = anim.type === 'move';
        particleUI.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <span class="text-gray-400 font-semibold flex items-center gap-1"><i class="ph ph-sparkle text-yellow-500"></i> VFX Particles</span>
                <label class="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" class="form-checkbox h-3 w-3 text-indigo-500 rounded border-gray-600 bg-gray-700 focus:ring-indigo-500 focus:ring-offset-gray-800" ${anim.vfxEnabled ? 'checked' : ''} id="vfx-enable-${index}">
                    <span class="text-[10px] text-gray-300">Enable</span>
                </label>
            </div>
            ${!isMove ? `
            <div class="flex items-center justify-between transition-opacity ${anim.vfxEnabled ? 'opacity-100' : 'opacity-40'}" id="vfx-timing-group-${index}">
                <span class="text-[10px] text-gray-500">Trigger Time</span>
                <select class="bg-gray-800 border-none text-gray-300 text-[10px] rounded px-1 py-0.5 outline-none" id="vfx-timing-${index}" ${!anim.vfxEnabled ? 'disabled' : ''}>
                    <option value="before" ${anim.vfxTiming === 'before' || !anim.vfxTiming ? 'selected' : ''}>Start (Before)</option>
                    <option value="after" ${anim.vfxTiming === 'after' ? 'selected' : ''}>End (After)</option>
                </select>
            </div>` : `
            <div class="text-[10px] text-gray-500 italic ${anim.vfxEnabled ? 'opacity-100' : 'opacity-40'}" id="vfx-timing-group-${index}">Leaves a trail along the path.</div>`}
        `;

        const vfxCheck = particleUI.querySelector(`#vfx-enable-${index}`);
        const vfxTimingGroup = particleUI.querySelector(`#vfx-timing-group-${index}`);
        const vfxTimingSelect = particleUI.querySelector(`#vfx-timing-${index}`);

        vfxCheck.addEventListener('change', e => {
            anim.vfxEnabled = e.target.checked;
            if(vfxTimingGroup) vfxTimingGroup.classList.toggle('opacity-40', !anim.vfxEnabled);
            if(vfxTimingSelect) vfxTimingSelect.disabled = !anim.vfxEnabled;
        });
        if(vfxTimingSelect) vfxTimingSelect.addEventListener('change', e => { anim.vfxTiming = e.target.value; });

        const stepElDiv = clone.children?.[0] || stepEl;
        if(stepElDiv && stepElDiv.querySelector) stepElDiv.querySelector('.anim-step')?.appendChild(particleUI);

        container.appendChild(clone);
        container.lastElementChild.appendChild(particleUI);
    });
    
    renderTimelineOverview();
}



// ----------------------------------------------------
// Trajectory Visualizer (DOTween Path Style)
// ----------------------------------------------------
function updateTrajectories() {
    const svg = document.getElementById('trajectory-svg');
    const layer = document.getElementById('canvas-layer');
    // Clear old elements
    Array.from(svg.querySelectorAll('.generated-path')).forEach(el => el.remove());
    Array.from(layer.querySelectorAll('.target-node')).forEach(el => el.remove());

    State.shapes.forEach(shape => {
        if(shape.animations.length === 0) return;
        
        // Only draw paths if shape has move animations
        let curX = shape.x;
        let curY = shape.y;
        
        // Shape center offset (approximate based on type)
        let cx = 0, cy = 0;
        if(shape.type === 'button') { cx = 32; cy = 32; } // square now
        else if(shape.type === 'item') { cx = 32; cy = 32; }
        else if(shape.type === 'star') { cx = 24; cy = 24; }

        shape.animations.forEach((anim, i) => {
            if (anim.type === 'move') {
                anim.startX = curX;
                anim.startY = curY;

                // Center logic
                const targetX = anim.targetX;
                const targetY = anim.targetY;
                
                // Init control point
                if (anim.ctrlX === undefined) {
                    anim.ctrlX = (curX + targetX) / 2;
                    anim.ctrlY = (curY + targetY) / 2 - 50;
                }
                
                // Draw SVG Curve
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', `M ${curX + cx} ${curY + cy} Q ${anim.ctrlX + cx} ${anim.ctrlY + cy} ${targetX + cx} ${targetY + cy}`);
                path.setAttribute('class', 'trajectory-line generated-path');
                if(State.selectedShapeId === shape.id) {
                    path.style.stroke = '#fbbf24'; 
                    path.style.strokeWidth = '3';
                }
                
                // Draw HTML Draggable Target Node
                const node = document.createElement('div');
                node.className = 'target-node';
                node.style.left = (targetX + cx) + 'px';
                node.style.top = (targetY + cy) + 'px';
                if(State.selectedShapeId === shape.id) {
                     node.style.backgroundColor = '#fbbf24';
                     node.style.transform = 'translate(-50%, -50%) scale(1.3)';
                }

                node.addEventListener('mousedown', (e) => {
                    selectShape(shape.id);
                    draggingMoveAnim = anim;
                    draggingMoveShape = shape;
                    draggingMoveCX = cx;
                    draggingMoveCY = cy;
                    document.body.style.cursor = 'grabbing';
                    e.stopPropagation();
                });

                // Draw HTML Draggable Control Point
                let ctrlNode = null;
                if(State.selectedShapeId === shape.id) {
                    ctrlNode = document.createElement('div');
                    ctrlNode.className = 'target-node ctrl-node';
                    ctrlNode.style.left = (anim.ctrlX + cx) + 'px';
                    ctrlNode.style.top = (anim.ctrlY + cy) + 'px';
                    
                    ctrlNode.addEventListener('mousedown', (e) => {
                        selectShape(shape.id);
                        draggingCtrlAnim = anim;
                        draggingMoveShape = shape; // reuse shape identifier
                        draggingMoveCX = cx;
                        draggingMoveCY = cy;
                        document.body.style.cursor = 'grabbing';
                        e.stopPropagation();
                    });

                    // Draw connecting lines to control point for visual clarity
                    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    p1.setAttribute('x1', curX + cx); p1.setAttribute('y1', curY + cy);
                    p1.setAttribute('x2', anim.ctrlX + cx); p1.setAttribute('y2', anim.ctrlY + cy);
                    p1.setAttribute('class', 'generated-path stroke-gray-600 stroke-1 border-dashed');
                    
                    const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    p2.setAttribute('x1', targetX + cx); p2.setAttribute('y1', targetY + cy);
                    p2.setAttribute('x2', anim.ctrlX + cx); p2.setAttribute('y2', anim.ctrlY + cy);
                    p2.setAttribute('class', 'generated-path stroke-gray-600 stroke-1 border-dashed');
                    
                    svg.appendChild(p1);
                    svg.appendChild(p2);
                }

                // Add text label step #
                const text = document.createElement('div');
                text.className = 'absolute text-white text-[10px] drop-shadow-md pointer-events-none target-node font-bold z-30';
                text.style.left = (targetX + cx + 12) + 'px';
                text.style.top = (targetY + cy) + 'px';
                text.style.backgroundColor = 'transparent';
                text.style.border = 'none';
                text.style.boxShadow = 'none';
                text.textContent = (anim.step || 1) + ' (' + (i+1) + ')';

                svg.appendChild(path);

                // Visualize Easing Overshoot/Anticipation
                let pMin = 0, pMax = 1;
                const easeVal = (anim.easeTransition && anim.easeDirection)
                    ? VFXHelpers.getGSAPEase(anim.easeTransition, anim.easeDirection)
                    : (anim.ease || null);
                if (easeVal) {
                    const easeFn = (typeof easeVal === 'function') ? easeVal : gsap.parseEase(easeVal);
                    if (easeFn) {
                        for(let t=0; t<=50; t++) {
                            const val = easeFn(t/50);
                            if (val < pMin) pMin = val;
                            if (val > pMax) pMax = val;
                        }
                    }
                }
                
                const dist = Math.sqrt(Math.pow(targetX - curX, 2) + Math.pow(targetY - curY, 2));
                
                if (pMin < 0) {
                    const p0x = curX + cx, p0y = curY + cy;
                    let dirX = p0x - (anim.ctrlX + cx);
                    let dirY = p0y - (anim.ctrlY + cy);
                    const len = Math.sqrt(dirX*dirX + dirY*dirY);
                    if(len > 0) {
                        dirX /= len; dirY /= len;
                        const extLength = Math.abs(pMin) * dist * 1.5;
                        const extPath = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        extPath.setAttribute('x1', p0x); extPath.setAttribute('y1', p0y);
                        extPath.setAttribute('x2', p0x + dirX * extLength); extPath.setAttribute('y2', p0y + dirY * extLength);
                        extPath.setAttribute('class', 'trajectory-line generated-path');
                        extPath.style.stroke = '#ef4444'; 
                        extPath.style.strokeDasharray = '4,4';
                        svg.appendChild(extPath);
                    }
                }
                
                if (pMax > 1) {
                    const p2x = targetX + cx, p2y = targetY + cy;
                    let dirX = p2x - (anim.ctrlX + cx);
                    let dirY = p2y - (anim.ctrlY + cy);
                    const len = Math.sqrt(dirX*dirX + dirY*dirY);
                    if(len > 0) {
                        dirX /= len; dirY /= len;
                        const extLength = Math.abs(pMax - 1) * dist * 1.5;
                        const extPath = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        extPath.setAttribute('x1', p2x); extPath.setAttribute('y1', p2y);
                        extPath.setAttribute('x2', p2x + dirX * extLength); extPath.setAttribute('y2', p2y + dirY * extLength);
                        extPath.setAttribute('class', 'trajectory-line generated-path');
                        extPath.style.stroke = '#3b82f6';
                        extPath.style.strokeDasharray = '4,4';
                        svg.appendChild(extPath);
                    }
                }

                layer.appendChild(node);
                if(ctrlNode) layer.appendChild(ctrlNode);
                layer.appendChild(text);

                curX = targetX;
                curY = targetY;
            }
        });
    });

    // Draw group move trajectories — arrows per child showing RELATIVE offset
    State.groups.forEach(grp => {
        const isGroupSelected = State.selectedGroupId === grp.id;
        
        let grpOffsetX = 0;
        let grpOffsetY = 0;

        grp.animations.forEach((anim, animIdx) => {
            if (anim.type !== 'move') return;
            
            anim.startX = grpOffsetX;
            anim.startY = grpOffsetY;
            
            const targetX = anim.targetX || 0;
            const targetY = anim.targetY || 0;
            
            if (anim.ctrlX === undefined) {
                anim.ctrlX = (grpOffsetX + targetX) / 2;
                anim.ctrlY = (grpOffsetY + targetY) / 2 - 50;
            }

            const allChildIds = getGroupAllChildren(grp);
            allChildIds.forEach(childId => {
                const shape = getShape(childId);
                if (!shape) return;
                const cx = (shape.type === 'button' || shape.type === 'item') ? 32 : 24;
                const cy = cx;
                
                const absStartX = shape.x + grpOffsetX;
                const absStartY = shape.y + grpOffsetY;
                const absTargetX = shape.x + targetX;
                const absTargetY = shape.y + targetY;
                const absCtrlX = shape.x + anim.ctrlX;
                const absCtrlY = shape.y + anim.ctrlY;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', `M ${absStartX + cx} ${absStartY + cy} Q ${absCtrlX + cx} ${absCtrlY + cy} ${absTargetX + cx} ${absTargetY + cy}`);
                path.setAttribute('class', 'trajectory-line generated-path');
                path.style.stroke = isGroupSelected ? '#a78bfa' : '#7c3aed';
                path.style.strokeWidth = isGroupSelected ? '2.5' : '1.5';
                path.style.strokeDasharray = '6,4';
                path.style.opacity = '0.7';
                svg.appendChild(path);

                const node = document.createElement('div');
                node.className = 'target-node';
                node.style.left = (absTargetX + cx) + 'px';
                node.style.top = (absTargetY + cy) + 'px';
                node.style.backgroundColor = isGroupSelected ? '#a78bfa' : '#7c3aed';
                node.style.transform = 'translate(-50%, -50%)';
                node.addEventListener('mousedown', (e) => {
                    selectGroup(grp.id);
                    const containerBox = document.getElementById('canvas-container').getBoundingClientRect();
                    const onMove = (ev) => {
                        anim.targetX = ev.clientX - containerBox.left - cx - shape.x;
                        anim.targetY = ev.clientY - containerBox.top - cy - shape.y;
                        updateTrajectories();
                    };
                    const onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                        document.body.style.cursor = 'default';
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                    document.body.style.cursor = 'grabbing';
                    e.stopPropagation();
                });
                
                let ctrlNode = null;
                if(isGroupSelected) {
                    ctrlNode = document.createElement('div');
                    ctrlNode.className = 'target-node ctrl-node';
                    ctrlNode.style.left = (absCtrlX + cx) + 'px';
                    ctrlNode.style.top = (absCtrlY + cy) + 'px';
                    ctrlNode.addEventListener('mousedown', (e) => {
                         selectGroup(grp.id);
                         const containerBox = document.getElementById('canvas-container').getBoundingClientRect();
                         const onMove = (ev) => {
                             anim.ctrlX = ev.clientX - containerBox.left - cx - shape.x;
                             anim.ctrlY = ev.clientY - containerBox.top - cy - shape.y;
                             updateTrajectories();
                         };
                         const onUp = () => {
                             window.removeEventListener('mousemove', onMove);
                             window.removeEventListener('mouseup', onUp);
                         };
                         window.addEventListener('mousemove', onMove);
                         window.addEventListener('mouseup', onUp);
                         e.stopPropagation();
                    });
                }
                
                layer.appendChild(node);
                if(ctrlNode) layer.appendChild(ctrlNode);

                const label = document.createElement('div');
                label.className = 'absolute text-white text-[10px] drop-shadow-md pointer-events-none target-node font-bold z-30';
                label.style.cssText = `left:${absTargetX+cx+12}px;top:${absTargetY+cy}px;background:transparent;border:none;box-shadow:none;color:#a78bfa;`;
                label.textContent = `\uD83D\uDCC1${grp.name} (${anim.step||1})`;
                layer.appendChild(label);
            });
            
            grpOffsetX = targetX;
            grpOffsetY = targetY;
        });
    });
}

// ----------------------------------------------------
// Playback Engine
// ----------------------------------------------------
let masterTimeline = null;

function updatePlayToggleUI(playing) {
    const btn = document.getElementById('btn-play-toggle');
    const icon = document.getElementById('play-icon');
    const text = document.getElementById('play-text');
    if(!btn) return;
    
    if(playing) {
        btn.classList.replace('bg-gray-700', 'bg-indigo-600');
        btn.classList.replace('hover:bg-gray-600', 'hover:bg-indigo-500');
        icon.classList.replace('ph-play', 'ph-stop');
        text.textContent = 'Playing';
    } else {
        btn.classList.replace('bg-indigo-600', 'bg-gray-700');
        btn.classList.replace('hover:bg-indigo-500', 'hover:bg-gray-600');
        icon.classList.replace('ph-stop', 'ph-play');
        text.textContent = 'Play';
    }
}

function playAll() {
    stopAll();
    masterTimeline = gsap.timeline({
        onComplete: () => { stopAll(); }
    });
    State.isPlaying = true;
    updatePlayToggleUI(true);
    
    document.getElementById('canvas-container').classList.add('is-playing');

    // Bucket all animations by step
    const buckets = {};

    // Individual shape animations
    State.shapes.forEach(shape => {
        shape.animations.forEach(anim => {
            const s = anim.step || 1;
            if(!buckets[s]) buckets[s] = [];
            buckets[s].push({ shape, anim });
        });
    });

    // Group animations → expand to ALL children (recursively), move as relative offset
    State.groups.forEach(grp => {
        grp.animations.forEach(anim => {
            const s = anim.step || 1;
            if(!buckets[s]) buckets[s] = [];
            const allChildIds = getGroupAllChildren(grp);
            allChildIds.forEach(childId => {
                const shape = getShape(childId);
                if (!shape) return;
                // For Move: treat targetX/Y as RELATIVE delta from each child's current position
                // For all other types: use anim directly (easing is on anim object)
                if (anim.type === 'move') {
                    const childAnim = new MoveAction({
                        step: anim.step,
                        duration: anim.duration,
                        easeTransition: anim.easeTransition,
                        easeDirection: anim.easeDirection,
                        vfxEnabled: anim.vfxEnabled,
                        vfxTiming: anim.vfxTiming,
                        targetX: shape.x + (anim.targetX || 0),
                        targetY: shape.y + (anim.targetY || 0),
                        startX: shape.x + (anim.startX || 0),
                        startY: shape.y + (anim.startY || 0),
                        ctrlX: shape.x + (anim.ctrlX || 0),
                        ctrlY: shape.y + (anim.ctrlY || 0)
                    });
                    buckets[s].push({ shape, anim: childAnim });
                } else {
                    buckets[s].push({ shape, anim });
                }
            });
        });
    });

    const steps = Object.keys(buckets).map(Number).sort((a,b)=>a-b);
    
    steps.forEach((step) => {
        const stepLabel = `step_${step}`;
        masterTimeline.addLabel(stepLabel);
        buckets[step].forEach(({shape, anim}) => {
            const tween = shape.buildTween(anim);
            if(tween) masterTimeline.add(tween, stepLabel);
        });
    });
}

function stopAll() {
    if(masterTimeline) masterTimeline.kill();
    State.isPlaying = false;
    updatePlayToggleUI(false);
    
    document.getElementById('canvas-container').classList.remove('is-playing');
    
    // Hard reset all shapes to INITIAL state
    State.shapes.forEach(shape => {
        gsap.killTweensOf(shape.el);
        shape.applyTransform();
    });
}

// ----------------------------------------------------
// Import/Export JSON Config
// ----------------------------------------------------
function showExport() {
    const modal = document.getElementById('export-modal');
    const textarea = document.getElementById('json-output');
    document.getElementById('modal-title').textContent = "Exported JSON Data";
    document.getElementById('modal-import-tools').classList.add('hidden');
    document.getElementById('modal-export-tools').classList.remove('hidden');
    textarea.setAttribute('readonly', 'true');
    
    // Build Clean Data Structure for Devs
    const devData = State.shapes.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        initialState: {
            x: Math.round(s.x),
            y: Math.round(s.y),
            scaleX: s.scaleX,
            scaleY: s.scaleY,
            rotation: s.rotation || 0,
            opacity: s.opacity,
            color: s.color,
            icon: s.icon
        },
        groupId: s.groupId || null,
        sequence: s.animations.map(a => {
            let data = { 
                type: a.type, 
                step: a.step || 1, 
                duration: a.duration, 
                easeTransition: a.easeTransition || 'Linear',
                easeDirection: a.easeDirection || 'In',
                vfxEnabled: a.vfxEnabled,
                vfxTiming: a.vfxTiming
            };
            if(a.type === 'move') { 
                data.targetX = Math.round(a.targetX); data.targetY = Math.round(a.targetY); 
                if(a.startX !== undefined) data.startX = Math.round(a.startX);
                if(a.startY !== undefined) data.startY = Math.round(a.startY);
                if(a.ctrlX !== undefined) data.ctrlX = Math.round(a.ctrlX); 
                if(a.ctrlY !== undefined) data.ctrlY = Math.round(a.ctrlY);
            }
            if(a.type === 'scale') { data.targetScaleX = a.targetScaleX; data.targetScaleY = a.targetScaleY; }
            if(a.type === 'fade') { data.targetOpacity = a.targetOpacity; }
            if(a.type === 'rotate') { data.targetRotation = a.targetRotation; data.relative = a.relative; }
            return data;
        })
    }));

    const groupsData = State.groups.map(g => ({
        id: g.id,
        name: g.name,
        childIds: g.childIds,
        parentGroupId: g.parentGroupId || null,
        sequence: g.animations.map(a => {
            let data = { type: a.type, step: a.step||1, duration: a.duration, easeTransition: a.easeTransition||'Linear', easeDirection: a.easeDirection||'In' };
            if(a.type === 'move') { data.targetX = Math.round(a.targetX); data.targetY = Math.round(a.targetY); }
            if(a.type === 'scale') { data.targetScaleX = a.targetScaleX; data.targetScaleY = a.targetScaleY; }
            if(a.type === 'fade') { data.targetOpacity = a.targetOpacity; }
            if(a.type === 'rotate') { data.targetRotation = a.targetRotation; data.relative = a.relative; }
            return data;
        })
    }));

    const finalConfig = {
        tool: "AnimCraft - Animation Reference",
        timestamp: new Date().toISOString(),
        totalElements: devData.length,
        elements: devData,
        groups: groupsData
    };

    textarea.value = JSON.stringify(finalConfig, null, 2);
    
    modal.classList.remove('hidden');
    // slight delay for transition
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild.classList.remove('scale-95');
    }, 10);
}

function hideExport() {
    const modal = document.getElementById('export-modal');
    modal.classList.add('opacity-0');
    modal.firstElementChild.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

function copyJson() {
    const textArea = document.getElementById('json-output');
    textArea.select();
    document.execCommand('copy');
    
    const btn = document.getElementById('btn-copy-json');
    const oldText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.replace('bg-gray-700', 'bg-green-600');
    setTimeout(() => {
        btn.textContent = oldText;
        btn.classList.replace('bg-green-600', 'bg-gray-700');
    }, 2000);
}

function downloadJson() {
    const text = document.getElementById('json-output').value;
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `animation_reference_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

function showImportModal() {
    const modal = document.getElementById('export-modal');
    document.getElementById('modal-title').textContent = "Import JSON Data";
    document.getElementById('json-output').value = '';
    document.getElementById('modal-export-tools').classList.add('hidden');
    document.getElementById('modal-import-tools').classList.remove('hidden');
    document.getElementById('json-output').removeAttribute('readonly');
    
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.firstElementChild.classList.remove('scale-95');
        document.getElementById('json-output').focus();
    }, 10);
}

function applyJsonText() {
    const text = document.getElementById('json-output').value;
    if(!text.trim()) return;
    try {
        const data = JSON.parse(text);
        loadDataFromJSON(data);
        hideExport();
    } catch(err) {
        alert("Pasted text is not valid JSON Data!");
        console.error(err);
    }
}

function importJsonFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            document.getElementById('json-output').value = JSON.stringify(data, null, 2);
            loadDataFromJSON(data);
            hideExport();
        } catch (err) {
            alert("Error parsing JSON file. Make sure it's a valid AnimCraft export.");
            console.error(err);
        }
        e.target.value = ''; // reset input
    };
    reader.readAsText(file);
}

function loadDataFromJSON(data) {
    if (!data.elements) throw new Error("Invalid format - missing elements tracking.");

    stopAll();
    State.shapes.forEach(s => s.el.remove());
    State.shapes = [];
    State.groups = [];
    selectShape(null);

    data.elements.forEach((elData, idx) => {
        const id = elData.id || `shape_${Date.now()}_${idx}`;
        const shape = new CanvasShape(id, elData.type, elData.initialState.x, elData.initialState.y, {
            name: elData.name,
            color: elData.initialState.color
        });
        // Support both old (scale) and new (scaleX/scaleY) formats
        if(elData.initialState.scaleX !== undefined) shape.scaleX = elData.initialState.scaleX;
        if(elData.initialState.scaleY !== undefined) shape.scaleY = elData.initialState.scaleY;
        if(elData.initialState.scale !== undefined && elData.initialState.scaleX === undefined) {
             shape.scaleX = elData.initialState.scale;
             shape.scaleY = elData.initialState.scale;
        }
        if(elData.initialState.rotation !== undefined) shape.rotation = elData.initialState.rotation;
        if(elData.initialState.opacity !== undefined) shape.opacity = elData.initialState.opacity;
        if(elData.initialState.icon !== undefined) shape.icon = elData.initialState.icon;
        if(elData.groupId) shape.groupId = elData.groupId;
        shape.applyTransform();
        shape.applyColor();
        shape.applyIcon();

        shape.animations = (elData.sequence || []).map((seq) => ActionFactory.create({
            id: seq.id || `anim_${Date.now()}_${Math.random().toString(36).substr(2,4)}`,
            ...seq
        })).filter(Boolean);
        
        State.shapes.push(shape);
    });

    // Restore groups
    if(data.groups) {
        data.groups.forEach(gData => {
            const grp = {
                id: gData.id,
                name: gData.name,
                childIds: gData.childIds || [],
                parentGroupId: gData.parentGroupId || null,
                animations: (gData.sequence || []).map(seq => ActionFactory.create({
                    id: seq.id || `anim_${Date.now()}_${Math.random().toString(36).substr(2,4)}`,
                    ...seq
                })).filter(Boolean)
            };
            State.groups.push(grp);
        });
    }

    renderOutliner();
    renderTimelineOverview();
    updateTrajectories();
}

// ----------------------------------------------------
// Particle System (VFX)
// ----------------------------------------------------
const VFX = {
    spawnBurst: (x, y, color) => {
        const layer = document.getElementById('canvas-layer');
        if(!layer) return;
        for(let i=0; i<12; i++) {
            const size = Math.floor(Math.random() * 12 + 12); // 12px to 24px
            const p = document.createElement('div');
            p.className = 'absolute rounded-full pointer-events-none z-0 shadow-lg';
            p.style.backgroundColor = color || '#fbbf24';
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.left = x + 'px';
            p.style.top = y + 'px';
            p.style.transform = 'translate(-50%, -50%)';
            layer.appendChild(p);

            const angle = (i / 12) * Math.PI * 2;
            const dist = 30 + Math.random() * 40;
            
            gsap.to(p, {
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                scale: 0,
                opacity: 0,
                duration: 0.4 + Math.random() * 0.3,
                ease: "power2.out",
                onComplete: () => p.remove()
            });
        }
    },
    spawnTrailDrop: (x, y, color) => {
        const layer = document.getElementById('canvas-layer');
        if(!layer) return;
        const size = Math.floor(Math.random() * 6 + 8); // 8px to 14px
        const p = document.createElement('div');
        p.className = 'absolute rounded-full pointer-events-none z-0';
        p.style.backgroundColor = color || '#fbbf24';
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.transform = 'translate(-50%, -50%)';
        layer.appendChild(p);
        
        gsap.to(p, {
            scale: 0,
            opacity: 0,
            duration: 0.6,
            ease: "power1.in",
            onComplete: () => p.remove()
        });
    }
};
