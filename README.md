# JVPlanner

A custom calendar and task management web app I built for myself after no existing tool worked the way I needed. Accessible as a PWA on iPhone and works across Mac, phone, and laptop.

## Why I built this

I tried Notion, Apple Calendar, Reminders, and a few others. Some had a calendar but no built-in task list, others were hard to follow, others restricted usage in ways that didn't work for me. So I built my own.

## Features

- Three separate calendars: General, School, and College
- Everything tab that shows all tasks across all calendars
- Integrated to-do list per calendar, tied to daily calendar events
- Daily summary on open
- Completed tasks section
- Automatic Canvas assignment imports every hour
- Push notifications to phone for upcoming tasks
- Downloadable as a PWA on iOS
- Google OAuth so only I can log in

## Note on personal configuration

This project is hardcoded for my own use. The Google OAuth, Supabase configuration, and Canvas integration are all tied to my personal accounts, so it won't work out of the box for anyone else. If you want to run your own version you'd need to set up your own Google OAuth credentials, Supabase project, and Canvas API token and swap them in.

## Stack

- Vanilla JavaScript / HTML / CSS
- Supabase for database and auth
- Google OAuth for login
- Canvas LMS API for assignment imports
- Hosted on GitHub Pages
