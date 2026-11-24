// server.js - the backend of Campus Cycle Rental.
// Start it with:  npm start   then open http://localhost:3000

// ---- 1. Load settings and packages ----
require('dotenv').config({ quiet: true });   // reads the .env file

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();

// ---- 2. Basic setup ----

// Lets us read form data with req.body
app.use(express.urlencoded({ extended: false }));

// Remembers who is logged in (saved in a cookie)
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// Sends the user back to a page with a message, e.g. /register.html?msg=...
function backWithMessage(res, page, message) {
  res.redirect(page + '?msg=' + encodeURIComponent(message));
}

// Rental price: 20 taka per hour, charged by the minute (v2)
// 1 minute = 20 / 60 = 0.333... taka
const FEE_PER_HOUR = 20;

// Every minute that has started counts: 10 seconds = 1 minute, 61 seconds = 2 minutes.
// (Even a very short ride counts as 1 minute.)
function minutesCharged(seconds) {
  return Math.max(1, Math.ceil(seconds / 60));
}

// Fee in taka, rounded to 2 decimals (paisa): 1 min = 0.33, 3 min = 1.00, 60 min = 20.00
function calculateFee(minutes) {
  const fee = minutes * FEE_PER_HOUR / 60;
  return Math.round(fee * 100) / 100;
}


// ---- 3. Protect pages: only logged-in users can open them ----

function requireStudent(req, res, next) {
  if (req.session.studentId) {
    next();                        // logged in: show the page
  } else {
    backWithMessage(res, '/', 'Please log in first.');
  }
}

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) {
    next();
  } else {
    backWithMessage(res, '/', 'Please log in as admin.');
  }
}

// These checks run BEFORE the page file is sent
app.get('/rental.html', requireStudent);
app.get('/admin.html', requireAdmin);


// ---- 4. Register a new student ----

app.post('/register', async (req, res) => {
  const { name, university_id, email, phone, password } = req.body;

  // Check the form (the browser checks too, but never trust only the browser)
  if (!name || !university_id || !email || !phone || !password) {
    return backWithMessage(res, '/register.html', 'Please fill in every field.');
  }
  if (password.length < 6) {
    return backWithMessage(res, '/register.html', 'Password must be at least 6 characters.');
  }

  try {
    // Scramble the password before saving it
    const passwordHash = await bcrypt.hash(password, 10);

    // The ? marks are filled in safely by mysql2 (this stops SQL injection)
    await db.query(
      'INSERT INTO students (name, university_id, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), university_id.trim(), email.trim(), phone.trim(), passwordHash]
    );

    backWithMessage(res, '/', 'Account created. You can log in now.');
  } catch (err) {
    // ER_DUP_ENTRY = this Student ID or email is already in the table
    if (err.code === 'ER_DUP_ENTRY') {
      return backWithMessage(res, '/register.html', 'This Student ID or email already has an account.');
    }
    console.error(err);
    backWithMessage(res, '/register.html', 'Something went wrong. Please try again.');
  }
});


// ---- 5. Log in (students and admin use the same form) ----

app.post('/login', async (req, res) => {
  const { university_id, password } = req.body;

  if (!university_id || !password) {
    return backWithMessage(res, '/', 'Please enter your Student ID and password.');
  }

  // Admin: username and password come from the .env file.
  // regenerate() throws away the old session and starts a clean one (safer, and
  // makes sure a student who was logged in before is not still remembered).
  if (university_id === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    return req.session.regenerate(() => {
      req.session.isAdmin = true;
      res.redirect('/admin.html');
    });
  }

  try {
    // Find the student with this Student ID
    const [rows] = await db.query(
      'SELECT id, name, password_hash FROM students WHERE university_id = ?',
      [university_id.trim()]
    );
    const student = rows[0];

    // Compare the typed password with the saved scrambled one
    if (!student || !(await bcrypt.compare(password, student.password_hash))) {
      return backWithMessage(res, '/', 'Wrong Student ID or password.');
    }

    // Start a clean session and remember this student (and the name, for "Hi, ...")
    req.session.regenerate(() => {
      req.session.studentId = student.id;
      req.session.studentName = student.name;
      res.redirect('/rental.html');
    });
  } catch (err) {
    console.error(err);
    backWithMessage(res, '/', 'Something went wrong. Please try again.');
  }
});


// ---- 6. Admin: bicycles (Phase 4) ----

// Add a new bicycle with its own code
app.post('/admin/bicycles', requireAdmin, async (req, res) => {
  // "cb-11 " becomes "CB-11" so the same code can't be added twice in different case
  const code = (req.body.code || '').trim().toUpperCase();

  if (!code || code.length > 20) {
    return backWithMessage(res, '/admin.html', 'Enter a bicycle code (up to 20 characters).');
  }

  try {
    await db.query('INSERT INTO bicycles (code) VALUES (?)', [code]);
    backWithMessage(res, '/admin.html', 'Bicycle ' + code + ' added.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return backWithMessage(res, '/admin.html', 'Bicycle ' + code + ' already exists. Use a different code.');
    }
    console.error(err);
    backWithMessage(res, '/admin.html', 'Something went wrong. Please try again.');
  }
});

// Send the list of all bicycles as JSON (admin.js shows it in the table)
app.get('/api/bicycles', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT code, status, created_at FROM bicycles ORDER BY code');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load bicycles.' });
  }
});


// ---- 7. Student: pick up and return (Phase 5) ----

// All bicycles with their status, so the rental page can show a card for each (v2 design)
app.get('/api/bikes', requireStudent, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT code, status FROM bicycles ORDER BY code');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load bicycles.' });
  }
});

// Pick up: student types a bicycle code and confirms
app.post('/rent/pickup', requireStudent, async (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  const studentId = req.session.studentId;

  if (!code) {
    return backWithMessage(res, '/rental.html', 'Enter the bicycle code from the tag.');
  }

  try {
    // Rule 1: one bicycle at a time. Does this student already have a ride that is not returned?
    const [activeRides] = await db.query(
      'SELECT id FROM rentals WHERE student_id = ? AND return_time IS NULL',
      [studentId]
    );
    if (activeRides.length > 0) {
      return backWithMessage(res, '/rental.html', 'You already have a bicycle. Return it before picking up another.');
    }

    // Rule 2: the code must belong to a real bicycle
    const [bikes] = await db.query('SELECT id FROM bicycles WHERE code = ?', [code]);
    const bike = bikes[0];
    if (!bike) {
      return backWithMessage(res, '/rental.html', 'No bicycle has the code ' + code + '. Check the tag and try again.');
    }

    // Rule 3: the bicycle must be free.
    // "AND status = 'available'" makes this safe even if two students press the button at the same time:
    // only one of them can change it, the other gets affectedRows = 0.
    const [result] = await db.query(
      "UPDATE bicycles SET status = 'rented' WHERE id = ? AND status = 'available'",
      [bike.id]
    );
    if (result.affectedRows === 0) {
      return backWithMessage(res, '/rental.html', 'Bicycle ' + code + ' is already rented. Try another one.');
    }

    // Save the ride with the pickup time (NOW() = current date and time in MySQL)
    await db.query(
      'INSERT INTO rentals (student_id, bicycle_id, pickup_time) VALUES (?, ?, NOW())',
      [studentId, bike.id]
    );

    backWithMessage(res, '/rental.html', 'Pickup confirmed. Enjoy your ride on ' + code + '!');
  } catch (err) {
    console.error(err);
    backWithMessage(res, '/rental.html', 'Something went wrong. Please try again.');
  }
});

// Return: student types the same code and confirms
app.post('/rent/return', requireStudent, async (req, res) => {
  const code = (req.body.code || '').trim().toUpperCase();
  const studentId = req.session.studentId;

  if (!code) {
    return backWithMessage(res, '/rental.html', 'Enter the code of the bicycle you are returning.');
  }

  try {
    // Find this student's ride on this bicycle that is not returned yet.
    // TIMESTAMPDIFF counts the seconds from pickup until now.
    const [rides] = await db.query(
      `SELECT rentals.id, rentals.bicycle_id,
              TIMESTAMPDIFF(SECOND, rentals.pickup_time, NOW()) AS seconds
       FROM rentals
       JOIN bicycles ON bicycles.id = rentals.bicycle_id
       WHERE rentals.student_id = ? AND bicycles.code = ? AND rentals.return_time IS NULL`,
      [studentId, code]
    );
    const ride = rides[0];
    if (!ride) {
      return backWithMessage(res, '/rental.html', 'You have no ride on bicycle ' + code + '. Use the code of the bicycle you picked up.');
    }

    // Work out the minutes and the fee (per minute)
    const minutes = minutesCharged(ride.seconds);
    const fee = calculateFee(minutes);

    // Save the return time, duration and fee, then make the bicycle free again
    await db.query(
      'UPDATE rentals SET return_time = NOW(), duration_minutes = ?, fee = ? WHERE id = ?',
      [minutes, fee, ride.id]
    );
    await db.query("UPDATE bicycles SET status = 'available' WHERE id = ?", [ride.bicycle_id]);

    backWithMessage(res, '/rental.html',
      'Return confirmed for ' + code + '. You rode for ' + minutes + ' min. ' +
      'Your fee is ' + fee.toFixed(2) + ' taka. Please pay in cash at the admin desk.');
  } catch (err) {
    console.error(err);
    backWithMessage(res, '/rental.html', 'Something went wrong. Please try again.');
  }
});

// Send the student's current ride as JSON (rental.js shows it). null = no ride now.
app.get('/api/my-ride', requireStudent, async (req, res) => {
  try {
    const [rides] = await db.query(
      `SELECT bicycles.code, rentals.pickup_time
       FROM rentals
       JOIN bicycles ON bicycles.id = rentals.bicycle_id
       WHERE rentals.student_id = ? AND rentals.return_time IS NULL`,
      [req.session.studentId]
    );
    const ride = rides[0];
    if (!ride) {
      return res.json(null);
    }
    // Also send the price, so rental.js can show "fee so far"
    ride.fee_per_hour = FEE_PER_HOUR;
    res.json(ride);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load your ride.' });
  }
});

// "My rides": the student's name and all of their own finished rides, newest first
app.get('/api/my-rides', requireStudent, async (req, res) => {
  try {
    const [rides] = await db.query(
      `SELECT bicycles.code, rentals.pickup_time, rentals.return_time,
              rentals.duration_minutes, rentals.fee, rentals.payment_status
       FROM rentals
       JOIN bicycles ON bicycles.id = rentals.bicycle_id
       WHERE rentals.student_id = ? AND rentals.return_time IS NOT NULL
       ORDER BY rentals.pickup_time DESC`,
      [req.session.studentId]
    );
    res.json({ name: req.session.studentName || 'there', rides: rides });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load your rides.' });
  }
});


// ---- 8. Admin: rentals and cash payment (Phase 6) ----

// Send all rentals as JSON, newest first (admin.js shows them in the table)
app.get('/api/rentals', requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT rentals.id, students.university_id, bicycles.code,
              rentals.pickup_time, rentals.return_time,
              rentals.duration_minutes, rentals.fee, rentals.payment_status
       FROM rentals
       JOIN students ON students.id = rentals.student_id
       JOIN bicycles ON bicycles.id = rentals.bicycle_id
       ORDER BY rentals.pickup_time DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load rentals.' });
  }
});

// Admin got the cash: mark the rental as paid.
// ":id" is the rental number from the address, e.g. /admin/rentals/5/paid
app.post('/admin/rentals/:id/paid', requireAdmin, async (req, res) => {
  try {
    // Only rides that are returned can be paid
    const [result] = await db.query(
      "UPDATE rentals SET payment_status = 'paid' WHERE id = ? AND return_time IS NOT NULL",
      [req.params.id]
    );
    if (result.affectedRows === 0) {
      return backWithMessage(res, '/admin.html', 'This ride is not returned yet, so it cannot be paid.');
    }
    backWithMessage(res, '/admin.html', 'Payment saved.');
  } catch (err) {
    console.error(err);
    backWithMessage(res, '/admin.html', 'Something went wrong. Please try again.');
  }
});


// ---- 9. Log out ----

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});


// ---- 10. Send the HTML/CSS files from the "public" folder ----
app.use(express.static('public'));


// ---- 11. Catch any unexpected error ----
// Shows a short message instead of the server's internal details.
// (Express knows this is an error handler because it has 4 inputs: err, req, res, next)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong. <a href="/">Go back to the start page</a>.');
});


// ---- 12. Start the server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
});
