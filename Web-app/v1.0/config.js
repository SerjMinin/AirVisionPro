/* 
 * Copyright (c) 2026 Минин Сергей Александрович.
 * Licensed under the GNU Affero General Public License v3.0.
 * See LICENSE file in the project root for full license information.
 */
// config.js — настройки подключения к серверу Supabase.
// Эти значения ПУБЛИЧНЫЕ (anon-ключ безопасен для сайта) — их можно хранить в коде.

// Адрес вашего проекта Supabase (замените на свой Project URL):
const SUPABASE_URL = "https://fgrheouadodyoldujrvh.supabase.co";
// ↑ Возьмите из Supabase → Settings → API → Project URL

// Публичный anon-ключ (замените на свой):
const SUPABASE_ANON_KEY = "sb_publishable_TujPEqgxjA3PnZ0I-EGbkw_vj0kLTVD";
// ↑ Возьмите из Supabase → Settings → API → anon public
// ⚠️ Сюда идёт ТОЛЬКО anon public. service_role НЕ вставлять!