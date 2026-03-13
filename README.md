# AnimCraft
> Animation is not an easy journey, especially for busy people 


AnimCraft is an interactive 2D animation sequencing, mocking, and graphing tool built with pure HTML, Vanilla JS, Tailwind CSS, and powered by GSAP. Designed with a Godot-like approach to UI nodes, easing curves, and element tracking, AnimCraft makes it easy to quickly sketch out rich UI and in-game animated choreographies with custom bezier paths and group animations.

## Features

- **Shapes & Canvas Interaction:** Instantiate shapes onto the canvas, drag them, and manipulate their properties directly.
- **GSAP Driven Core:** Leverages standard GSAP for high-performance interpolations, smooth tweens, transitions, and timing.
- **Step-Based Sequence Logic:** Orchestrate animations chronologically matching a game engine. Actions on `step 1` finish before `step 2` starts, allowing you to build complex multi-phase sequences effortlessly.
- **Robust Outliner & Inspector:** 
  - Manage elements via a tree-based Outliner and an Inspector panel.
  - Setup separate horizontal & vertical scale (`Scale X`, `Scale Y`), Rotation, Position (drag-and-drop or direct metric input), Color, and Opacity.
- **Move Paths with Trajectory Interaction:** Click and drag curve anchors (control points) right on the canvas. AnimCraft visualizes exact predicted movement lines, accommodating Elastic and Back transition overshoots natively.
- **Grouping & Nesting:**
  - Create groups to organize elements and build hierarchies. Parents can safely nest within parents preventing cycles.
  - Apply animations to the group itself. A Group's **Move** animation computes as a cohesive **relative offset** delta across all shapes inside that group (recursively applied down the tree), sharing identical easing patterns.
- **Particle VFX Engine Additions:** Some components trigger simple, lightweight programmatic particle effects entirely styled in JS/GSAP (no external sprite assumptions required).
- **Import / Export JSON:** Easily dump and restore states into a simple JSON config. Copy configuration straight to clipboard for code integration or save your drafts.
  - 🌟 **Highly Recommended:** Check out `Anim/example.json` to get a comprehensive overview of the tool! You can import this file via the **Import JSON** button to see a pre-built animated sequence in action.

## Quick Start

1. Ensure you have the required files directly openable (`index.html`, `script.js`).
2. Run AnimCraft: Open `index.html` in any modern web browser.
3. Click **Add (+) Element** icons (Box, Circle) on the top-left toolbar to start placing items on the workspace.
4. With an item selected, view the Properties dropdown to alter initial states, and the Animations dropdown to build out a timeline.
5. Create Groups with the Folder icon and assign Shapes/Groups via the **Parent Group** dropdown in the Properties inspector!
6. Click **Play** at the very top. 

## Technical Details
AnimCraft relies strictly on modern web APIs. No bundlers or Node prerequisites exist to execute the application—it handles its own DOM updates natively while using GSAP (via CDN) to render physics-driven or tween-based logic. Easing curve nomenclatures line up precisely with universally recognized formats (`Quad.easeInOut`, `Elastic.easeOut`).

## Disclaimer
*"This is the best version that could possibly be created at this very moment in time... so maybe, just maybe, there won't be any more updates until the stars align perfectly in the future!"* 🚀
