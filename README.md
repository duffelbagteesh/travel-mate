# Final Project Starter

This project includes a Node Devcontainer. Be sure to install Node >=18 if you don't plan to utilize the embedded Docker container.

## Development

### Install dependencies

```bash
npm install
```

### Set DB Connection String
Duplicate `.env.example` as `.env`.
```bash 
cp .env.example .env
```

Don't forget to update the environment variables in your `.env` file.

### Run the app

```bash
npm run dev
```

## Setup Your Database

In order for the user creation to work automatically, you need a `users` table in your database. The provided schema definition below will create a compatible `users` table for you.

```sql
CREATE TABLE users
(
    id serial NOT NULL,
    auth0_id text NOT NULL,
    given_name text,
    family_name text,
    email text,
    picture text,
    PRIMARY KEY (id)
);
```
