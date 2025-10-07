# Design Guidelines: Customer Support Chatbot Platform

## Design Approach

**Selected Approach:** Design System + SaaS Reference Hybrid

Drawing inspiration from modern SaaS platforms like Linear, Intercom, and Notion, with a foundation in clean, functional design principles. This approach prioritizes information density, workflow efficiency, and professional polish suitable for business users managing customer support operations.

**Key Design Principles:**
- **Clarity First:** Every element serves a clear purpose in the support workflow
- **Data Visibility:** Analytics and documents are immediately accessible
- **Seamless Transitions:** Smooth navigation between ingestion, widget, and analytics
- **Professional Trust:** Clean aesthetics that inspire confidence in the platform

---

## Core Design Elements

### A. Color Palette

**Dark Mode (Primary):**
- Background: 220 15% 10% (deep slate)
- Surface: 220 13% 15% (elevated slate)
- Border: 220 10% 25% (subtle dividers)
- Primary Brand: 217 91% 60% (vibrant blue - trust & tech)
- Text Primary: 0 0% 98%
- Text Secondary: 220 9% 65%
- Success: 142 71% 45%
- Warning: 38 92% 50%
- Error: 0 72% 51%

**Light Mode:**
- Background: 0 0% 100%
- Surface: 220 13% 97%
- Border: 220 13% 91%
- Primary Brand: 217 91% 50%
- Text Primary: 220 15% 15%
- Text Secondary: 220 9% 46%

### B. Typography

**Font Families:**
- Primary: Inter (via Google Fonts) - interface, body text
- Monospace: JetBrains Mono - code snippets, widget embed codes

**Scale:**
- Display (h1): text-4xl font-bold (analytics headlines)
- Section Titles (h2): text-2xl font-semibold
- Card Headers (h3): text-lg font-medium
- Body: text-base font-normal
- Small/Meta: text-sm text-secondary
- Code: text-sm font-mono

### C. Layout System

**Spacing Units:** Use Tailwind units of 1, 2, 3, 4, 6, 8, 12, 16, 20 for consistent rhythm
- Component padding: p-4 to p-6
- Section spacing: gap-6 to gap-8
- Page margins: px-6 lg:px-8
- Card spacing: p-6

**Grid Structure:**
- Main container: max-w-7xl mx-auto
- Dashboard columns: grid-cols-1 lg:grid-cols-3 (sidebar + main + detail)
- Card grids: grid-cols-1 md:grid-cols-2 lg:grid-cols-3

---

## Component Library

### D. Navigation & Structure

**Top Navigation Bar:**
- Fixed header (h-16) with platform logo left, user profile/settings right
- Navigation tabs: Upload, Widget, Analytics, Settings
- Active state: border-b-2 border-primary with primary text color
- Background: bg-surface with border-b

**Sidebar (Optional Context Panel):**
- Left sidebar (w-64) for document filters, recent uploads
- Collapsible on mobile
- Uses surface background with subtle border-r

### E. Core Components

**Document Upload Zone:**
- Large drag-drop area (min-h-64) with dashed border-2 border-dashed
- Icon (upload cloud) + "Drag files here or click to browse"
- Supported formats badge below
- File list with progress bars and remove buttons

**Document Library Cards:**
- Grid layout with document preview thumbnails
- File name (font-medium), size, upload date (text-sm text-secondary)
- Action menu (3-dot) with view/download/delete options
- Hover state: subtle scale transform and shadow-lg

**Widget Generator Panel:**
- Two-column layout: Configuration (left) + Live Preview (right)
- Configuration form with:
  - Color pickers (primary, background)
  - Position selector (bottom-right, bottom-left)
  - Text inputs (welcome message, placeholder)
  - Toggle switches (show branding, auto-open)
- Preview in mock browser window with the actual widget rendered
- Copy code button with success toast feedback

**Widget Preview:**
- Contained in rounded-xl border card
- Shows chatbot bubble and expanded chat window
- Real-time updates as user adjusts settings
- Responsive preview switching (desktop/mobile views)

**Analytics Dashboard:**
- Stats cards row: Total queries, Avg response time, Top issue, Satisfaction (grid-cols-4)
- Each card: Large number (text-3xl font-bold), label (text-sm), trend indicator
- Charts section: Line chart (queries over time), Bar chart (top queries)
- Use subtle gradients in charts (blue to cyan)
- Data table: Most asked questions with frequency counts

**Authentication Screens:**
- Centered card (max-w-md) on gradient background (subtle blue-purple)
- Logo at top, form fields with clear labels
- Primary CTA button full-width
- Social auth options with icon buttons
- Link to switch login/signup (text-sm text-primary)

### F. Interactive Elements

**Buttons:**
- Primary: bg-primary text-white px-4 py-2 rounded-lg font-medium
- Secondary: bg-surface border border-border
- Ghost: hover:bg-surface/50
- Icon buttons: p-2 rounded-md
- Loading states: spinner + disabled opacity

**Form Inputs:**
- Border: border border-border rounded-lg
- Focus: ring-2 ring-primary/20 border-primary
- Dark backgrounds maintained in dark mode
- Label: text-sm font-medium mb-2
- Helper text: text-xs text-secondary

**Data Tables:**
- Zebra striping: even:bg-surface/50
- Header: bg-surface border-b sticky top-0
- Row hover: hover:bg-surface
- Action cells: text-right with icon buttons

### G. Animations

**Minimal, Purposeful Motion:**
- Page transitions: 150ms ease-in-out opacity
- Card hover: transform scale-[1.02] duration-200
- Button interactions: built-in hover/active states only
- Toast notifications: slide-in from top-right
- NO complex scroll animations or parallax effects

---

## Images

**Hero Image (Authentication/Landing):**
- Abstract customer support visual (headset, chat bubbles, happy customers)
- Placement: Right side of split-screen auth layout or subtle background
- Style: Modern illustration or soft photography with brand color overlay
- Size: Cover 50% of viewport on desktop, hidden on mobile

**Empty States:**
- Illustration for empty document library (upload icon, friendly prompt)
- Empty analytics state (chart icon, "No data yet" message)
- Style: Line art illustrations in primary brand color

**Dashboard Icons:**
- Use Heroicons (outline style) consistently throughout
- Document icons for file types (PDF, TXT, DOCX)
- Analytics icons (chart-bar, trending-up, users)
- Widget icons (code-bracket, adjustments)

---

## Page-Specific Layouts

**Upload Page:**
- Full-width drag-drop zone at top
- URL scraper form below (input + scrape button)
- Document grid below with search/filter bar
- 3-column grid on lg screens, 2 on md, 1 on mobile

**Widget Page:**
- Split 50/50: Configuration panel (left) + Live preview (right)
- Sticky preview that follows scroll
- Code snippet section at bottom with copy button
- Tabs for different framework integrations (HTML, React, Vue)

**Analytics Page:**
- Top stats row (4 metric cards)
- Charts section (2-column: line chart + bar chart)
- Full-width data table below
- Date range picker in top-right corner
- Export button for reports

**Key UX Patterns:**
- Persistent top navigation across all pages
- Breadcrumbs for deep navigation
- Toast notifications for all actions (success/error)
- Loading skeletons for async content
- Confirmation modals for destructive actions