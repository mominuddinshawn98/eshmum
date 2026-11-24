# Phase 7: Testing & Demo (final project)

**Campus Cycle Rental System** · Eshmum Mahmud & Momin Uddin Shawon · CSE, Tools and Technologies for Internet Programming

A website for students to rent bicycles and move around campus easily.

## Features

- Students create an account and log in. Admin uses the same login form.
- Every bicycle has its own code (e.g. CB-01) and a picture card on the student page.
- **Pickup:** tap a bike card (or type its code) and confirm. The timer starts.
- **Return:** type the same code and confirm. The timer stops.
- **Fee by the minute:** 20 taka an hour, 0.33 taka a minute, calculated automatically.
- **First-ride greeting** and **My rides**: every student sees their own ride record and totals.
- **Admin panel:** add bicycles, see all rentals, filter them, and mark cash payments as paid.
- **Design "Aurora Sky":** soft sky-and-water gradient, frosted glass panels, a bicycle riding along the bottom of every page.

## Technologies

| Part | Technology |
|---|---|
| Pages and design | HTML, CSS |
| Timer, fee display, bike cards, tables | JavaScript |
| Backend | Node.js, Express.js |
| Database | MySQL |

## Folder structure

```
├── server.js          Backend: all routes (login, rental, admin)
├── db.js              MySQL connection
├── .env.example       Settings to copy into .env
├── package.json       Packages
├── database/
│   ├── schema.sql     Creates the database and 3 tables
│   └── README.md      ER diagram
└── public/
    ├── index.html     Log in
    ├── register.html  Create account
    ├── rental.html    Student page
    ├── admin.html     Admin panel
    ├── style.css      Design for all pages
    ├── ui.js          Messages, loading buttons
    ├── rental.js      Bike cards, timer, fee, My rides
    └── admin.js       Numbers, bicycles, rentals, payments
```

## How to run

You need **Node.js** and **MySQL**.

1. Install the packages (first time only):
   ```bash
   npm install
   ```
2. Create the database (first time only; running it again deletes all data):
   ```bash
   mysql -u root -p < database/schema.sql
   ```
3. Copy `.env.example` to `.env` and fill in your MySQL password, a long random `SESSION_SECRET`, and an `ADMIN_PASSWORD`.
4. Start the server:
   ```bash
   npm start
   ```
5. Open **http://localhost:3000**. Admin: type `admin` and your `ADMIN_PASSWORD` in the normal login form.

## Demo script (about 5 minutes)

Use a normal browser window for the student and a private (incognito) window for the admin.

| Step | Window | What to do | What to show |
|---|---|---|---|
| 1 | Student | Open http://localhost:3000/rental.html | Sent to log in: pages are protected |
| 2 | Student | Create an account, then log in | "Hi, (name)", a picture card for every bike, empty "My rides" |
| 3 | Admin | Log in as admin, add bicycle `CB-04` | It appears in the bicycle list |
| 4 | Student | Refresh, tap the CB-04 card, press Pick up | First-ride greeting, the ring timer and the fee start |
| 5 | Student | Try to return with a wrong code | Refused: only your own bike |
| 6 | Student | Return with `CB-04` | Message with minutes and fee; the ride appears in "My rides" with a "First ride" badge |
| 7 | Admin | Refresh, filter "Unpaid", press "Mark as paid" | Unpaid changes to Paid |
| 8 | Student | Refresh | The ride shows "Paid" in "My rides" |

**Tip for a longer ride:** before step 6, run this in MySQL to make the ride 65 minutes old (fee 21.67 taka):
```sql
UPDATE campus_cycle.rentals SET pickup_time = NOW() - INTERVAL 65 MINUTE WHERE return_time IS NULL;
```

## Test cases

All passed on 21 Nov 2026.

| # | Area | Test | Expected result |
|---|---|---|---|
| 1 | Security | Open the student or admin page without logging in | Sent to the login page |
| 2 | Security | A student opens the admin page | Refused |
| 3 | Register | New account / same Student ID again / password under 6 characters | Created / "already has an account" / clear error |
| 4 | Login | Wrong password | Error, and the Student ID stays filled in |
| 5 | Security | SQL injection `' OR '1'='1` as Student ID | Login refused |
| 6 | Bicycles | Admin adds ` cb-09 `, then `CB-09` again | Saved as `CB-09`, then "already exists" |
| 7 | Bike cards | Student page | One card per bicycle; rented ones show "In use" and can't be chosen |
| 8 | Pickup | Unknown code / second bike while riding / bike someone else has | Each refused with a clear message |
| 9 | Greeting | First ride / second ride | Greeting shown / not shown |
| 10 | Return | Wrong code / right code | Refused / saved, bicycle free again |
| 11 | Fee | 10 s, 61 s, 3 min, 30 min, 60 min, 65 min | 0.33, 0.67, 1.00, 10.00, 20.00, 21.67 taka |
| 12 | My rides | After a return | New row with date, times, minutes, fee, "Unpaid"; totals update; "First ride" badge on the first one |
| 13 | Payment | Student tries "Mark as paid" / admin marks a ride still going / admin marks a returned ride | Refused / refused / Paid, also in the student's "My rides" |
| 14 | Layout | Every page at phone width (375 px) | No sideways scrolling, every button at least 44 px |

## Known limits

- Logins are kept in the server's memory: restarting the server logs everyone out.
- Payment is cash only; the admin marks it as paid by hand.
- Bicycles can be added but not edited or deleted.
- The glass blur needs a modern browser; older ones show solid white panels instead.
