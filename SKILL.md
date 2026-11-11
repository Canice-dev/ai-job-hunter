---
name: frontend-design
description: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one. Helps with aesthetic direction, typography, and making choices that don't read as templated defaults.
license: Complete terms in LICENSE.txt
---

# Frontend Design

Approach this as the design lead for Job Hunter, a private workspace for finding, assessing, and tracking technology jobs. Make deliberate choices that fit this product and its owner. Keep new UI consistent with the existing web app and use `apps/web/designs/web-ui-theme.png` as supporting visual inspiration for clear workspace regions and compact, useful context. Do not copy chat-specific content or controls. The product's workflows and any explicit user direction take precedence.

## Ground your designs in the subject matter

If the brief does not identify what the product or subject matter is, identify it yourself before designing, and confirm with the client. You can come up with one concrete subject, the design's audience, and the design's primary job, as a proposal. If there's any information in your memory about the client's preferences or context about what they're building, use that as a hint. The subject's industry, subject matter, materials, and vernacular are where distinctive visual choices come from — a design for a toy for girls aged 8–11 will be very aesthetically different from a dashboard for financial analysts. Build with the brief's real content and subject matter throughout.

## Design principles

### Workspace theme

Use this visual language as the foundation for Job Hunter screens:

- **Color:** keep the app predominantly white (`#FFFFFF`) with a very light cool-gray navigation surface (`#F8F8FA`), charcoal text (`#252525`), muted gray supporting text (`#707279`), and pale gray dividers (`#E2E3E8`). Use near-black (`#242424`) for the primary action. Status colors stay quiet and meaningful: blue-gray for new, warm sand for saved, soft green for applied or connected, and muted red for errors or destructive actions. Do not add a loud orange accent by default; the reference image is inspiration, not the app's color specification. Adjust values as needed to meet contrast requirements.
- **Typography:** use the existing Manrope family when it is available. Keep a clear, compact scale with restrained weights. Establish hierarchy through size, weight, and spacing rather than decorative display faces. Use sentence case and make metadata comfortably readable.
- **Surfaces:** use white for the main work area and subtle gray for the sidebar or supporting regions. Define sections with fine borders and small background shifts. Keep shadows minimal and corner radii modest; reserve the strongest emphasis for the active navigation item and primary action.
- **Layout:** preserve the app's navigation sidebar and focused main content area. Make job lists easy to scan as rows, with title, company, location, fit, source, and status arranged in a stable hierarchy. Put explanations, gaps, follow-up controls, and prepared materials near the job they describe. Add a separate context rail only when it improves a real workflow. On mobile, collapse navigation and stack job details without hiding important status or actions.
- **Density:** support quick comparison with concise rows, clear section headings, useful metadata, and predictable actions. Keep enough spacing for touch and keyboard use. Use badges, status dots, and progress indicators only when they represent real job or account state.

Express the product through opportunity lists, understandable match scores and reasons, visible fit gaps, source attribution, application statuses, and reviewable documents. Make uncertainty and processing failures clear without overpowering the job itself. Never imply that Job Hunter applies to jobs automatically. Keep these choices consistent across Home, Discover, Saved jobs, Applications, Profile, and Telegram screens.

For web designs, the hero is the first thing viewers will see. Open with the most characteristic thing in the subject's world, in the form that is most appropriate: a headline, an image, an animation, a live demo, an interactive moment, or other treatments. Be deliberate with your choice: a big number with a small label, supporting stats, and a gradient accent is the default treatment, so only use it if that's truly the best option.

Typography carries the personality of the page. You don't need a different typeface for display or headline text and body content: use one family or two, and if two, make them clearly distinct.

Use Manrope for Job Hunter unless the project already has a deliberate, compatible type system. Distinguish hierarchy with a considered scale, weights, widths, and spacing rather than novelty for its own sake. Follow the guidance of The Elements of Typographic Style. When type is used as a headline or visual element, make the treatment intentional and readable.

Default to line lengths of less than 80 characters. Serif typefaces can have slightly longer line lengths; give serif body text slightly more line-height than a sans-serif.

Avoid these default typographic treatments; they are the commonest tells of a generated page:
- Accenting just a single word or phrase in a headline, like putting one word in italic/bold or a different color.
- Using all caps for labels.
- Adding unnecessary typographic labels above content.

Visual structure is information. Structural devices like outlines, borders, numbering, eyebrows, dividers, labels, etc., encode useful information about the content rather than decorate it. Many generic designs use numbered markers (01 / 02 / 03), but that's only appropriate if the content actually is a sequence — like a stepped process or a timeline. Before adding numbered markers, check the content really is a sequence.

Use non-user-triggered motion sparingly and deliberately, only to draw attention. A single orchestrated moment — one page-load sequence or one reveal — lands better than scattered effects; fade-and-slide-up entrances on each section and hover transitions on every card are the generic default and read as AI-generated. Motion that answers a person's action (opening, expanding, confirming) is welcome when it shows what changed.

Consider written content carefully. Often a design brief may not contain real content, and it's up to you to come up with copy and placeholder content. Copy can make a design feel as templated as the design itself. See the below section on writing for more guidance.

## Process: plan, review against the brief, build, critique

Avoid defaults that make unrelated products look alike: decorative cream-and-terracotta palettes, near-black pages with acid accents, newspaper columns, identical rounded cards with repeated shadows, gradient washes, all-caps eyebrows above every heading, excessive metadata punctuation, and arrows appended to every action. The light workspace theme above is a starting point for this project, not a reason to ignore the product or turn every screen into a generic template.

All traits are legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject. Where the brief pins down a visual direction, follow it exactly — the brief's own words always win, including when it asks for one of these looks. Where it leaves an axis free, don't spend that freedom on one of these defaults. As with a hired human designer, there's often a careful balance between doing what you're good at and taking each project as a chance to experiment and learn.

Work in two passes. First, make a short design plan from the client's brief and the workspace theme: define color, type, layout, and principles.
- Color: name 4–6 core hex values, starting from the theme tokens above when no brand palette is supplied. Identify any semantic accent colors and what states they mean.
- Type: name the typeface or families and their roles, with a readable scale and weights.
- Layout: describe the composition and alignment. For multi-pane work, explain what belongs in navigation, the primary task area, and any context rail. Use a small ASCII wireframe when it helps compare options.
- Principles: state what makes the interface specific to this product and what information deserves the strongest emphasis.

Then review the plan against both the brief and the reference. Check that it preserves the theme's calm workspace structure without copying irrelevant chat details, and that its content, hierarchy, and interactions fit this specific product. If a choice feels generic or unsupported by the brief, revise it and explain why before writing code. Follow the revised plan during implementation.

When writing the code, be careful of structuring your CSS selector specificities. It's easy to generate CSS classes that cancel each other out (especially with a type-based selector like .section and an element-based selector like .cta). This can happen often with padding/margin between sections.

## Restraint and self-critique

Spend your boldness in one place. Let one element be the memorable thing, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Build to a quality floor without announcing it: responsive down to mobile, visible keyboard focus, reduced motion respected, visually accessible, harmonious color palettes. Critique your own work as you build, taking screenshots to review if your environment supports it — a picture is worth 1000 tokens. Consider Chanel's advice: before leaving the house, take a look in the mirror and remove one accessory. Human creatives have memory and always try to do something new, so if you have a space to quickly jot down notes about what you've tried, it can help you in future passes.

## More on writing in design

Words appear in a design for one reason: to make it easier to understand and use. They are design content, not decoration. Bring the same intentionality and minimalism to copywriting that you would bring to spacing and color. Before writing anything, ask what the design needs to say, and how it can best be said to help the person navigate the experience.

Write from the end user's perspective. Name things by what users will understand in simple language, not by how the system is built. A user manages notifications, not webhook config. Describe what something is or does in plain terms rather than selling it. Being specific and legible to new users is always better than being clever.

Use active voice as default. A CTA says exactly what happens when it is used: "Save changes," not "Submit." An action keeps the same name through the whole flow, so the button that says "Publish" produces a toast that says "Published." The vocabulary of an interface is the signposting for someone navigating the product. Cohesion and consistency are how people learn their way around.

Treat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it, in the interface's voice rather than a person's. Errors don't apologize, and they are never vague about what happened. An empty screen is an invitation to act.

Keep the tone conversational: plain verbs, sentence case, no filler, with tone matched to the brand and the audience. Let each written element do exactly one job.
