# App Store submission pack

Paste these into App Store Connect. Character limits are in brackets.

## Listing

**Name** [30]: Heirloom: Antique Identifier

**Subtitle** [30]: Real sold prices, honest value

**Keywords** [100]: antique,appraisal,vintage,value,worth,collectibles,scanner,hallmark,pottery,resale,estate,thrift,identify

**Promotional text** [170]: Find out what that old piece is really worth. Every estimate shows the verified sold prices behind it, how confident we are, and what could make it worth less.

**Category**: Reference (secondary: Lifestyle)

**Description**:

```
What is it? What is it really worth? Where should you sell it?

Photograph an old item and Heirloom identifies it, then checks recent sold prices so you get a realistic range, not an exciting guess.

SEE THE EVIDENCE
• A value range based on what similar items actually sold for
• The comparable sales behind the estimate, with links you can check
• A confidence level that drops when the evidence is thin
• Quick-sale and replacement figures alongside the likely sale price

CATCH THE EXPENSIVE MISTAKES
• Warnings when your item could be a cheaper look-alike, like silver plate or a later reproduction
• Checks you can do yourself at home
• A request for a close-up of the maker's mark when one photo isn't enough
• Tell us what we got wrong and we'll re-check, free

SELL WITH CONFIDENCE (PRO)
• The best places to sell each item, and what you'd keep after fees
• Ready-to-paste listing titles and descriptions
• Your whole collection with its total estimated value
• Spreadsheet export for estates and inventories

RECORDS FOR INSURANCE AND ESTATES
Buy a PDF report for any item, with photos, description, value range and comparable sales.

Your first 3 scans are free, and a failed scan never counts.

Estimates are automated and aren't certified appraisals. Heirloom doesn't authenticate items.

Terms: https://YOUR_PROJECT.web.app/terms
Privacy: https://YOUR_PROJECT.web.app/privacy
```

**Support URL**: https://YOUR_PROJECT.web.app/support

**Privacy policy URL**: https://YOUR_PROJECT.web.app/privacy

## Pricing

| Product | Type | Price | ID |
|---|---|---|---|
| Heirloom Pro Yearly, 3-day free trial | Auto-renewing | $39.99 | `heirloom_pro_annual` |
| Heirloom Pro Monthly | Auto-renewing | $7.99 | `heirloom_pro_monthly` |
| PDF Report | Consumable | $4.99 | `heirloom_item_report` |

These match the current market: Relic lists $39.99 a year and Patina lists $7.99 a month or $44.99 a year. There is no weekly plan at launch, because surprise trial and renewal charges are a repeat complaint in competitors' reviews. Add one later as an A/B test if yearly conversion is weak; the paywall supports it with no code change.

## Screenshots

Required sets: iPhone 6.9" (1320 x 2868) and, because the app runs on iPad, iPad 13" (2064 x 2752). App Store Connect rejects any other dimensions, so check its Screenshot specifications page first.

Take these in TestFlight with a real item that has strong comparables. Caption each one:

1. Result screen: "See what it really sells for"
2. Comparable sales: "Every estimate shows its evidence"
3. Look-alike warning: "Catch the expensive mistakes"
4. Where to sell: "Know what you'll keep after fees"
5. Collection: "Your whole collection, valued"
6. PDF report: "Records for insurance and estates"

## App Privacy answers

| Data type | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Photos | Yes | Yes | No | App functionality |
| Other user content (notes) | Yes | Yes | No | App functionality |
| User ID | Yes | Yes | No | App functionality |
| Email address (Sign in with Apple) | Yes | Yes | No | App functionality |
| Purchase history | Yes | Yes | No | App functionality |

## Age rating

Answer "None" to the content questions. Unrestricted web access: choose No only if Apple's questionnaire treats links opened in a browser sheet that way; comparables and eBay searches open real web pages, so answer honestly per the current form.

## App Review notes

```
Heirloom identifies old items from photos and estimates resale value.

No login is needed. The app creates an anonymous account automatically. Sign in with Apple is optional, in Settings, for backing up a collection. Account deletion is in Settings > Delete account and data.

To test: finish the intro, close the paywall with the X, open the Scan tab, take or choose a photo of any object, tap "Find out what it's worth", and accept the data-sharing notice. Results take about 30 to 90 seconds. Three free scans are included.

AI disclosure: before the first scan, the app asks permission to send photos and notes to Anthropic (Claude), which performs the analysis.

Purchases: Pro subscription (paywall) and a consumable PDF report (bottom of any result page).
```

## Before you press Submit

- [ ] Search the App Store and USPTO for "Heirloom" in this class. The name is a working title and I haven't cleared it.
- [ ] Replace `SUPPORT_EMAIL`, `OPERATOR_NAME` and `LAST_UPDATED` in `site/*.html`.
- [ ] Have a lawyer read the privacy policy and terms. They're solid drafts, not legal advice.
- [ ] Complete 20 or so real test scans across categories, and check values by hand against sold listings.
- [ ] Set a monthly spend limit in the Anthropic console.
- [ ] Test a sandbox trial, renewal, restore, report purchase and account deletion in TestFlight.
