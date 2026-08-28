/**
 * Supabase client configuration
 */

import { createClient } from '@supabase/supabase-js'
import { ENV } from './constants'

// Public client (uses anon key, RLS enforced)
export const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_ANON_KEY
)

// Service client (bypasses RLS, server-side only)
export const supabaseAdmin = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY
)

// Type-safe database interface
export type Database = {
  public: {
    Tables: {
      admins: {
        Row: {
          id: string
          email: string
          password_hash: string
          name: string
          role: 'SUPER_ADMIN' | 'SITE_ADMIN' | 'VIEWER'
          is_active: boolean
          last_login_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          password_hash: string
          name: string
          role?: 'SUPER_ADMIN' | 'SITE_ADMIN' | 'VIEWER'
          is_active?: boolean
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          password_hash?: string
          name?: string
          role?: 'SUPER_ADMIN' | 'SITE_ADMIN' | 'VIEWER'
          is_active?: boolean
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      sites: {
        Row: {
          id: string
          name: string
          slug: string
          omada_site_id: string | null
          location: string | null
          description: string | null
          status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          omada_site_id?: string | null
          location?: string | null
          description?: string | null
          status?: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          omada_site_id?: string | null
          location?: string | null
          description?: string | null
          status?: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'
          timezone?: string
          created_at?: string
          updated_at?: string
        }
      }
      packages: {
        Row: {
          id: string
          name: string
          description: string | null
          duration_seconds: number
          price_tzs: number
          status: 'ACTIVE' | 'INACTIVE' | 'DELETED'
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          duration_seconds: number
          price_tzs: number
          status?: 'ACTIVE' | 'INACTIVE' | 'DELETED'
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          duration_seconds?: number
          price_tzs?: number
          status?: 'ACTIVE' | 'INACTIVE' | 'DELETED'
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      portal_sessions: {
        Row: {
          id: string
          session_token_hash: string
          site_id: string | null
          client_mac: string
          ap_mac: string
          ssid_name: string
          site_name: string | null
          portal_timestamp: string | null
          gateway_mac: string | null
          radio_id: string | null
          vid: string | null
          redirect_url: string | null
          portal_auth_url: string | null
          selected_package_id: string | null
          status: 'CREATED' | 'PACKAGE_SELECTED' | 'PAYMENT_INITIATED' | 'PAYMENT_SUCCESS' | 'AUTHORIZED' | 'EXPIRED' | 'FAILED'
          client_ip: string | null
          user_agent: string | null
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_token_hash: string
          site_id?: string | null
          client_mac: string
          ap_mac: string
          ssid_name: string
          site_name?: string | null
          portal_timestamp?: string | null
          gateway_mac?: string | null
          radio_id?: string | null
          vid?: string | null
          redirect_url?: string | null
          portal_auth_url?: string | null
          selected_package_id?: string | null
          status?: 'CREATED' | 'PACKAGE_SELECTED' | 'PAYMENT_INITIATED' | 'PAYMENT_SUCCESS' | 'AUTHORIZED' | 'EXPIRED' | 'FAILED'
          client_ip?: string | null
          user_agent?: string | null
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_token_hash?: string
          site_id?: string | null
          client_mac?: string
          ap_mac?: string
          ssid_name?: string
          site_name?: string | null
          portal_timestamp?: string | null
          gateway_mac?: string | null
          radio_id?: string | null
          vid?: string | null
          redirect_url?: string | null
          portal_auth_url?: string | null
          selected_package_id?: string | null
          status?: 'CREATED' | 'PACKAGE_SELECTED' | 'PAYMENT_INITIATED' | 'PAYMENT_SUCCESS' | 'AUTHORIZED' | 'EXPIRED' | 'FAILED'
          client_ip?: string | null
          user_agent?: string | null
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
      }
      payment_transactions: {
        Row: {
          id: string
          reference: string
          site_id: string | null
          package_id: string | null
          portal_session_id: string | null
          client_mac: string
          ap_mac: string
          ssid_name: string
          phone_number: string
          amount_tzs: number
          malipopay_transaction_id: string | null
          status: 'PENDING' | 'PAYMENT_INITIATED' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_CANCELLED' | 'PAYMENT_TIMEOUT' | 'OMADA_AUTHORIZING' | 'AUTHORIZED' | 'AUTHORIZATION_FAILED' | 'EXPIRED'
          webhook_processed_at: string | null
          webhook_payload: any | null
          error_code: string | null
          error_message: string | null
          authorized_at: string | null
          expires_at: string | null
          duration_seconds: number | null
          omada_voucher_group_id: string | null
          voucher_code: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          reference: string
          site_id?: string | null
          package_id?: string | null
          portal_session_id?: string | null
          client_mac: string
          ap_mac: string
          ssid_name: string
          phone_number: string
          amount_tzs: number
          malipopay_transaction_id?: string | null
          status?: 'PENDING' | 'PAYMENT_INITIATED' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_CANCELLED' | 'PAYMENT_TIMEOUT' | 'OMADA_AUTHORIZING' | 'AUTHORIZED' | 'AUTHORIZATION_FAILED' | 'EXPIRED'
          webhook_processed_at?: string | null
          webhook_payload?: any | null
          error_code?: string | null
          error_message?: string | null
          authorized_at?: string | null
          expires_at?: string | null
          duration_seconds?: number | null
          omada_voucher_group_id?: string | null
          voucher_code?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          reference?: string
          site_id?: string | null
          package_id?: string | null
          portal_session_id?: string | null
          client_mac?: string
          ap_mac?: string
          ssid_name?: string
          phone_number?: string
          amount_tzs?: number
          malipopay_transaction_id?: string | null
          status?: 'PENDING' | 'PAYMENT_INITIATED' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_CANCELLED' | 'PAYMENT_TIMEOUT' | 'OMADA_AUTHORIZING' | 'AUTHORIZED' | 'AUTHORIZATION_FAILED' | 'EXPIRED'
          webhook_processed_at?: string | null
          webhook_payload?: any | null
          error_code?: string | null
          error_message?: string | null
          authorized_at?: string | null
          expires_at?: string | null
          duration_seconds?: number | null
          omada_voucher_group_id?: string | null
          voucher_code?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      client_authorizations: {
        Row: {
          id: string
          transaction_id: string
          site_id: string | null
          portal_session_id: string | null
          client_mac: string
          ap_mac: string
          ssid_name: string
          status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
          duration_seconds: number
          authorized_at: string
          expires_at: string
          revoked_at: string | null
          revoke_reason: string | null
          omada_response: any | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          transaction_id: string
          site_id?: string | null
          portal_session_id?: string | null
          client_mac: string
          ap_mac: string
          ssid_name: string
          status?: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
          duration_seconds: number
          authorized_at?: string
          expires_at: string
          revoked_at?: string | null
          revoke_reason?: string | null
          omada_response?: any | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          transaction_id?: string
          site_id?: string | null
          portal_session_id?: string | null
          client_mac?: string
          ap_mac?: string
          ssid_name?: string
          status?: 'ACTIVE' | 'EXPIRED' | 'REVOKED'
          duration_seconds?: number
          authorized_at?: string
          expires_at?: string
          revoked_at?: string | null
          revoke_reason?: string | null
          omada_response?: any | null
          created_at?: string
          updated_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          action: string
          admin_id: string | null
          site_id: string | null
          transaction_id: string | null
          details: any | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          action: string
          admin_id?: string | null
          site_id?: string | null
          transaction_id?: string | null
          details?: any | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          action?: string
          admin_id?: string | null
          site_id?: string | null
          transaction_id?: string | null
          details?: any | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
      }
    }
  }
}