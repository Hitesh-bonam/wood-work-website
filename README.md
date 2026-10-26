# Woodwork website

Your showcase website. **All your photos go in the `images` folder.** Every project is one folder
there, with just two folders inside: `before` and `after`. Put photos in them and they appear on the
website by themselves. You never need to touch any code.

```
wood work/
├── images/                 ← ALL YOUR PROJECT PHOTOS
│   ├── project-1/
│   │   ├── before/         ← photos of the home BEFORE the work (empty rooms, old walls)
│   │   ├── after/          ← photos of the FINISHED work
│   │   └── info.txt        ← optional: title, area, days, price
│   ├── project-2/
│   │   ├── before/
│   │   └── after/
│   ├── _template/          ← copy this to start a new project
│   └── HOW TO ADD PHOTOS.txt
├── site/                   ← YOUR BUSINESS
│   ├── business.txt        ← name, phone, WhatsApp, areas, hours
│   ├── rates.txt           ← your rate card for the Pricing page
│   ├── materials/          ← photos for the Materials page
│   ├── team/               ← photos for "Our team" on the Contact page
│   └── logo.png            ← optional: add your logo here
├── PREVIEW.cmd             ← double-click: see the website on your computer
└── PUBLISH.cmd             ← double-click: put your changes online
```

The folders `project-1` to `project-4` are **samples** with drawn pictures (marked "SAMPLE PHOTO").
Delete them once your real projects are in.

## Add a new project

1. Copy the `images/_template` folder and rename the copy to the next number, for example `project-5`.
2. Put the photos of the home **before** the work in its `before` folder, and photos of the
   **finished** work in its `after` folder.
3. Double-click `PREVIEW.cmd` to see it, then `PUBLISH.cmd` to put it online.

That's all. On the website the project shows its **Before** photos first, then its **After** photos,
and the first after photo is its cover in the gallery. The highest number shows first, as
"Project 5". Numbers never change, so you can tell a customer "look at project 3" and they will
always find the same one.

To add more photos to a project later, just put them in its `before` or `after` folder.

### The order of the photos

Photos show **in the same order as in the folder** when the folder is sorted by name (the usual
view in File Explorer). Photos straight from a phone (`IMG_20261011_…`, `WhatsApp Image 2026-10-11 …`)
are already in the order you took them. To choose the order yourself, start the names with numbers:
`1 kitchen.jpg`, `2 hall.jpg`, … `10 balcony.jpg` (10 comes after 9, as you'd expect).

### Optional: title, area and price (info.txt)

Open the project's `info.txt` and fill in what you want. Everything is optional; without it the
project simply shows as "Project 5".
```
Title: 3BHK full interior
Area: Green Park
Size: 3BHK, 1,850 sq ft
Days: 42
Finished: Sep 2026
Type: Full home, Wardrobes, Kitchens

Price:
Wardrobes (3) = 1,92,000
Modular kitchen = 1,45,000
```
A line like `Note: GST extra` is shown under the price. Capital letters in file and folder names don't
matter (`Before`, `AFTER` and `Info.txt` all work).

### Photo tips

- **Any photo from your phone works** (JPG, PNG, WebP or JFIF). Photos are automatically turned upright, made smaller for the web
  (a 5 MB phone photo becomes about 200 KB), and **the GPS location is removed** so your clients'
  addresses are never shared.
- **The file name becomes the caption:** `master-wardrobe-sliding-doors.jpg` shows as
  "Master wardrobe sliding doors". Phone names like `IMG_2041.jpg` are fine; they just show no caption.
- **Optional slider:** give a before photo and an after photo the **same name** (for example
  `kitchen.jpg` in both folders) and the website also shows the two side by side, with a line you
  drag to compare. Photos with different names are never paired up.
- **A different cover photo:** name a photo `cover.jpg` and put it directly in the project folder.
- **iPhone HEIC photos** can't be shown on websites. On the iPhone choose
  Settings › Camera › Formats › Most Compatible, or send the photo to yourself on WhatsApp first.
- **Videos** are too big for the website. Upload them to YouTube (unlisted is fine) and add the link
  to `info.txt`, like `Video: https://youtu.be/...`
- **More folders (optional):** any other folder you make in a project, like `pooja room`, shows as
  its own section after Before and After. You don't need this; `before` and `after` are enough.

## Change your business details and prices

- `site/business.txt`: business name, tagline, phone, WhatsApp, email, areas, hours, map, years,
  warranty. **The WhatsApp and Call buttons appear once you add your real numbers.**
- `site/rates.txt`: one line per service, like `Wardrobes = 1200 / 1700 per sq ft`
  (standard / premium). These feed the Pricing page and its estimator.
- A project's price is optional. If you don't want to show a price, leave it out of `info.txt`
  completely (see "Privacy" below).

## See the website on your computer

Double-click **`PREVIEW.cmd`**. Your browser opens the website. Keep the black window open;
when you add, change or delete photos, the page refreshes by itself. Close the window to stop.

When the website is on GitHub, PREVIEW.cmd first brings down anything you added from your phone,
so this folder always matches what's online.

## Put the website online (free, on GitHub)

**First time only:**

1. Create a free account at [github.com](https://github.com). To get an address with your business
   name, also create a free *organization*, for example `yourwoodworks`.
2. Create a **public** repository, for example `website`. (Free GitHub Pages needs a public repository.)
3. Connect this folder to it and send the files. The easiest way is the free
   [GitHub Desktop](https://desktop.github.com) app: *File › Add local repository* and choose this folder,
   then *Publish*. (Or ask Claude to do it for you.)
4. On GitHub open the repository's **Settings › Pages** and set **Source** to **GitHub Actions**.

Your website is then live at `https://yourwoodworks.github.io/website/`. A custom address like
`yourwoodworks.in` can be added later for a small yearly fee, but you don't need one.

**After that:** double-click **`PUBLISH.cmd`** (or, in GitHub Desktop, press *Fetch origin*, then *Commit*
and *Push*). The website updates about 2 minutes later. GitHub checks every link and photo first; if
something is broken, nothing changes online and the last good version stays up.

### Phone and computer are one project

There is only one website and one GitHub repository. Photos added from your phone go straight into
the same `images/` folders on GitHub. PUBLISH.cmd and PREVIEW.cmd bring them down into this folder,
and PUBLISH.cmd sends your computer's photos up, so both sides always end up with everything.

If the same file was changed on both sides, PUBLISH.cmd stops and names the file. Nothing is lost:
give one of the photos a different name and run it again.

## Add photos from your phone

At a job site you can add a new project, or more photos to a project, straight from your phone. No
computer needed. The photos go into the same `images/` folders on GitHub as the ones from your
computer, and your website updates about 2 minutes later.

**The upload page** is your website's address with `admin/` at the end, for example
`https://yourwoodworks.github.io/website/admin/`. It isn't linked from your website, and it asks search
engines not to list it. Bookmark it, or add it to your home screen (iPhone: *Share › Add to Home Screen*;
Android: Chrome's *⋮ menu › Add to Home screen*).

### First time only: give your phone a key

The page saves to GitHub with a key that only you have. It's easiest to make the key on the phone
itself, in its browser. You can also make it on a computer and send it to yourself (for example
WhatsApp "Message yourself"), then delete that message.

1. Sign in at [github.com](https://github.com) and open
   [Settings › Developer settings › Personal access tokens › Fine-grained tokens](https://github.com/settings/personal-access-tokens/new).
   The link opens the form for a new token.
2. **Token name:** `Phone uploads`.
3. **Resource owner:** the account or organization that owns the website, for example `yourwoodworks`.
4. **Expiration:** the longest it offers (about a year). Put a reminder in your calendar for a few days
   before it ends. When it runs out, the upload page says GitHub didn't accept the key: make a new one the
   same way and paste it. The old key stays on the phone until the new one works.
5. **Repository access:** *Only select repositories*, then choose your website's repository (for example `website`).
6. **Permissions:** under *Repository permissions*, set **Contents** to **Read and write**. Leave everything else as it is.
7. Tap **Generate token** and copy the key. It starts with `github_pat_`. GitHub shows it only once.
8. Open the upload page, paste the key and tap **Connect**. The phone remembers it.

The key can only change the files of this one repository, and the page sends it only to GitHub. Never
share it or put it in a file. If a phone is lost, or someone else sees the key, delete the key on the same
GitHub page and make a new one. *Forget this phone*, at the bottom of the upload page, removes the key
(and any photos waiting to be sent) from a phone you keep.

**One website per account:** every GitHub Pages website of one account or organization shares the same
storage on the phone, so another website there could read the saved key. Don't make other GitHub Pages
websites on this account, or give this one its own address (a custom domain).

If the repository belongs to an organization, a key made by the organization's owner works straight away.
A key made by anyone else must first be approved in the organization's *Settings › Personal access tokens*.

### Adding photos

1. **Which project?** Choose *New project* (the page shows its number) or an existing project.
2. **Before or after the work?** *Before* puts the photos in the project's `before` folder (the home
   before you started), *After* in its `after` folder (the finished work).
3. **Add photos:** tap *Choose photos* (your gallery) or *Take a photo*. Type a caption if you like; it is
   shown under the photo on the website. Tick *Cover photo* on the photo you want in front.
4. **Project details** are optional: title, area, days, price list and so on. For an existing project you
   see what is there now, and only what you change is changed.
5. Tap **Publish**, and keep the page open until it says *Done!*

Good to know:

- Before anything is sent, the phone makes each photo smaller (at most 2000 pixels) and **removes its
  GPS location**, because the repository is public.
- Photos show on the website in the order you add them.
- **Optional slider:** give an after photo the same caption as a before photo (the caption box
  suggests them) and the website also shows the two side by side, with a line to drag.
- **Photos wait on the phone until they're published,** with their captions and details, even if the
  page closes (no signal, the camera app, the phone low on memory). Open the page again and they're back;
  *Clear all photos* removes them.
- No signal at the site? Tap *Publish* again when you're back online. Nothing is ever saved twice, even
  if the signal went just as you published.
- Each *Publish* is one save on GitHub, so you can see it there, and undo it if you need to.
- Photos added from the phone appear in this folder on your computer the next time you run
  PREVIEW.cmd or PUBLISH.cmd. (In GitHub Desktop: *Fetch origin*, then *Pull origin*.)
- **iPhone:** Safari forgets the key, and any waiting photos, if you don't open the page for about a week.
  Adding the page to your Home Screen keeps them; otherwise just paste the key again.

## Free limits, and when the website gets full

- GitHub Pages gives each website **1 GB** and about **100 GB of visitors a month**, free.
- Each photo uses about 0.3 MB on the website, so the website holds **about 3,000 photos**.
- The repository also keeps your photos (made smaller, about 0.5 MB each). GitHub asks that a
  website's repository stays under about 1 GB, which is **about 2,000 photos** (roughly 80 projects
  of 25 photos). Going a little over doesn't break anything, but plan the move below by then.
- Every build prints how full both are, and warns you when one is close.
- When it gets close to full: move older projects' photos into a second free GitHub repository,
  or serve this same repository from Cloudflare Pages (free, no 1 GB limit). Your files stay yours,
  so nothing needs to be redesigned.

## Privacy

- The repository is **public**, so anyone can see the files in it. Never put clients' names, phone
  numbers or exact addresses, or your internal costs, in `info.txt` or in file names.
- If you don't want a price shown, don't type it into the file at all. Hiding it isn't enough.
- Ask clients before you show photos of their home, and your workers before you show theirs.
- GitHub Pages is for showcase websites like this one; it doesn't allow online shops or payments.
  That's why all enquiries go to WhatsApp and phone.

## For developers

| Command | What it does |
| --- | --- |
| `npm run dev` | Live preview at http://localhost:4321 (same as PREVIEW.cmd) |
| `npm run build` | Builds the website into `dist/` |
| `npm run check` | Checks every link and photo in `dist/` |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser tests: Chrome, Firefox, Safari; laptop, phone, tablet, every width from 320 px to 2560 px |
| `npm run samples` | Recreates the sample projects if they're missing |
| `npm run clean-photos` | Tidies every original photo (also runs automatically before each commit) |

The code lives in `src/`: `content.mjs` reads the folders, `photos.mjs` processes photos,
`pages.mjs` writes the HTML, and `assets/` holds the styles and the script for the photo viewer, story
mode, before/after slider, filters and estimator. Every page works without JavaScript; the script only
adds the interactive parts.

The phone upload page is `src/admin.mjs` (the page) with `assets/admin.js` (what happens on the phone)
and `assets/admin-core.js` (photo names, `info.txt` edits and the GitHub commit, shared with the unit
tests). `tests/e2e/admin.spec.mjs` tests it in every browser against a stand-in for GitHub.
