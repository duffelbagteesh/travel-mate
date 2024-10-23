require('dotenv').config()
const express = require('express');
const nunjucks = require('nunjucks');
 
const app = express();
const port = process.env.PORT || 3000

// Database client
const client = require('./db/index.js')

const { auth, requiresAuth } = require('express-openid-connect');
const config = {
    authRequired: false,
    auth0Logout: true,
    secret: process.env.AUTH0_SECRET,
    baseURL: process.env.SITE_URL || 'http://localhost:3000',
    clientID: process.env.AUTH0_CLIENT_ID,
    issuerBaseURL: 'https://dev-cq57ujdlzj18afcj.us.auth0.com'
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));


app.use(express.static('public'))

// Add near your other `app.use()` directives
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


// Configure Nunjucks
nunjucks.configure('views', {
    autoescape: true,
    noCache: process.env.NODE_ENV !== 'production',
    express: app
});

// Anyone can view this page!
app.get('/', async function(req, res, next) {
    if (req.oidc.isAuthenticated()) {
        res.redirect('/feed');
    } else {
        res.render('index.njk', { title: 'Home', isAuthenticated: false });
    }
});

app.get('/create', function(req, res, next) {
    if (req.oidc.isAuthenticated()) {
        res.render('create.njk', { title: 'Create a New Post' });
    } else {
        res.redirect('/');
    }
});

// Handle form submissions for creating a new post
app.post('/create', createUserIfNotExists, async function(req, res, next) {
    if (req.oidc.isAuthenticated()) {
        // Get the post content from the form submission
        const title = req.body.title;
        const content = req.body.content;

        // Insert the new post into the 'posts' table in the database...
        await insertPostIntoDatabase(title, content, req.oidc.user);

        // Redirect the user to the feed page
        res.redirect('/feed');
    } else {
        res.redirect('/');
    }
});

app.delete('/delete/:id', requiresAuth(), async function(req, res, next) {
    // Get the post ID from the route parameters
    const postId = req.params.id;

    // Fetch the post from the database
    const post = await client.query('SELECT * FROM posts WHERE id = $1', [postId]);

    // Check if the post exists and if the authenticated user is the author
    if (post.rowCount === 0 || post.rows[0].auth0_id !== req.oidc.user.sub) {
        res.status(403).send('You do not have permission to delete this post');
        return;
    }

    // Delete the post from the database
    await client.query('DELETE FROM posts WHERE id = $1', [postId]);

    res.send('Post deleted successfully');
});

app.get('/feed', requiresAuth(), async function(req, res, next) {
    // Fetch posts from the database...
    const posts = await getPostsFromDatabase();

    // Render the 'feed' template with the posts
    res.render('feed.njk', { title: 'Your Feed', posts: posts, user: req.oidc.user});
});

// Only authenticated users can view this page!
app.get('/profile', requiresAuth(), async (req, res) => {
    const user = await getUserFromDatabase(req.oidc.user.sub);
    console.log(user);
    res.render('profile.njk', { title: "Your Profile", user: user });

})

app.post('/profile/update', requiresAuth(), async function(req, res) {
    const auth0_id = req.oidc.user.sub;
    const { field, value } = req.body;
    try {
      const updatedUser = await updateUserProfile(auth0_id, field, value);
      if (updatedUser) {
        res.json(updatedUser);
      } else {
        res.status(404).send('User not found or invalid field.');
      }
    } catch (error) {
      console.error('Error:', error);
      res.status(500).send('An error occurred while trying to update your profile.');
    }
  });

app.get('/create-post', requiresAuth(), async function(req, res, next) {
    res.render('create-post.njk', { title: 'Create a Post' });
}
);

/**
 * This is a middleware function that will check if the user exists in the database.
 * If the user does not exist, it will create the user in the database.
 * This function will only run if the user is authenticated.
 */
async function createUserIfNotExists (req, res, next) {

    console.info("Checking if this user exists in database...")

    if(req.oidc.isAuthenticated()){

        // Get the user information from the request
        let { sub:auth0_id, given_name, family_name, email, picture } = req.oidc.user

        // Check if the logged-in user exists in the database
        let user = await client.query('SELECT * FROM users WHERE auth0_id = $1', [auth0_id])
        if(user.rowCount === 0){
            console.log('New User! Inserting into database')
            // Insert the user into the database
            await client.query(
                'INSERT INTO users (auth0_id, given_name, family_name, email, picture) VALUES ($1, $2, $3, $4, $5)', 
                [auth0_id, given_name, family_name, email, picture || null]
            )
            console.info('User inserted into database:', email)
        }else{
            console.info('User already exists in database:', user.rows[0].email)
        }
    }else{
        console.info('Nevermind. This user is not authenticated.')
    }

    // Carry on my wayward son...
    next()
}

async function insertPostIntoDatabase(title, content, user) {
    // Create a new post
    const post = {
        title: title,
        content: content,
        auth0_id: user.sub,
    };

    // Insert the post into the 'posts' table
    await client.query('INSERT INTO posts (auth0_id, title, content) VALUES ($1, $2, $3)', [post.auth0_id, post.title, post.content]);
}

async function getPostsFromDatabase() {
    let posts = await client.query(`
        SELECT posts.*, users.given_name
        FROM posts
        JOIN users ON posts.auth0_id = users.auth0_id
        ORDER BY posts.created_at DESC
    `);
    return posts.rows;
}

async function getUserFromDatabase(auth0_id) {
    const result = await client.query('SELECT * FROM users WHERE auth0_id = $1', [auth0_id]);
    return result.rows[0];
  }

const validFields = ['email', 'given_name', 'picture'];
async function updateUserProfile(auth0_id, field, value) {
    if (!validFields.includes(field)) {
        console.error(`Invalid field: ${field}`);
        return false;
    }
    try {
        const query = `UPDATE users SET ${field} = $1 WHERE auth0_id = $2 RETURNING *`;
        const values = [value, auth0_id];
        const result = await client.query(query, values);

        return result.rows[0];
    } catch (err) {
        console.error(err);
        return false;
    }
}

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})