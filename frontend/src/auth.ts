/// <reference types="vite/client" />
import {createClient} from '@supabase/supabase-js';
const url=import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const key=import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY??import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
export const authClient=url&&key?createClient(url,key):null;
