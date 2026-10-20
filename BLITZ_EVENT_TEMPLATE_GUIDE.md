# BLITZ Event Template Guide

## Purpose

[`BLITZ_EVENT_TEMPLATE.json`](./BLITZ_EVENT_TEMPLATE.json) is the official,
versioned JSON template for preparing BLITZ events with an AI assistant or
manually. It is the same format accepted by the Prezi Panel importer. Imported
data is reviewed in the normal event editor; importing never saves, publishes,
uploads files, or changes administrator permissions.

## Create a new event file

1. Download or copy [`BLITZ_EVENT_TEMPLATE.json`](./BLITZ_EVENT_TEMPLATE.json).
2. Keep `"template": "BLITZ_EVENT"` and `"version": 1` unchanged.
3. Duplicate the file for the event and edit only the `event` object.
4. Keep unknown facts empty (`""`, `null`, or `[]`) instead of guessing.

Required fields are `title`, `category`, and `description`, unless the event is
explicitly marked with `"placeholder": true`. `id` is the lowercase
dash-separated slug. `layout` must be `event`, `workshop`, `competition`,
`festival`, or `speaker`. `date` and `start_date`, when supplied, use
`YYYY-MM-DD`; `start_date` is used as the event date when `date` is empty.

All other fields are optional. The importer preserves the additional supported
content in the event details model, including objectives, people, agenda,
registration, modules, results, media metadata, links, and SEO fields.
Unsupported field names are rejected so typos are not silently lost.

## Repeatable fields

Add objects to the representative arrays in the template:

- `speakers`, `organizers`, `sessions`, `winners`, `links`, and `gallery`
  support multiple entries.
- A session can include `title`, dates/times, venue, description, and
  `speakers`.
- A winner can include `position`, `title`, `names`, and `team_members`.
- A gallery item can include `filename`, `caption`, and `alt`.
- Use `teams` for team name, institution, and member name/position records.

Keep the provided property names. Arrays may contain strings where appropriate,
or objects when the representative object shows the expected properties.

## AI completion instruction

Copy this instruction into an AI assistant together with the poster, brochure,
notes, or other supplied material:

> Read the supplied event materials, extract only supported facts, and complete
> a copy of BLITZ_EVENT_TEMPLATE.json. Preserve the schema and field names.
> Leave unknown optional fields empty. Do not invent facts or media URLs. Return
> valid JSON only, followed by a separate list of missing information and a
> media upload checklist.

Review the result yourself. AI output is not an approval or a publication
action.

## Media and links

The `media` section records filenames, captions, and descriptions only. It does
not upload files or create storage paths. Select or upload the actual poster,
cover image, gallery photos, brochure, certificates, result sheets, and
documents through the Prezi Panel after importing. The same applies to links:
only confirmed HTTPS URLs should be entered.

## Validate and import

Validate the JSON with any standard JSON parser, for example:

```bash
node -e "JSON.parse(require('fs').readFileSync('BLITZ_EVENT_TEMPLATE.json', 'utf8')); console.log('valid JSON')"
```

Then:

1. Sign in to `prezi_panel/`.
2. Open **Events** and select **New Event**.
3. Choose **Import template**, upload the completed `.json` file, and read all
   validation messages and media warnings.
4. Select **Import into form**. For an existing event, explicitly choose merge
   or replace.
5. Review and edit every populated field, upload actual media, and check the
   live preview.
6. Save as a draft first. Publish only after using the explicit publish action
   and confirmation.

An invalid JSON file, incompatible version, unsupported field, invalid date,
or wrong value type is rejected with an actionable message. Empty optional
fields are accepted.
