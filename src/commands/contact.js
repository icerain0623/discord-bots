import { buildContactModal } from '../modals/contactModal.js'

export async function handleContact() {
  return { type: 9, data: buildContactModal() }
}
