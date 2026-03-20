export function buildContactModal() {
  return {
    custom_id: 'contact_modal',
    title: '匿名で連絡する',
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'contact_body',
          label: '内容',
          placeholder: '通報・相談・その他、自由に記入してください',
          style: 2, // Paragraph
          required: true,
          max_length: 1000,
        }],
      },
    ],
  }
}

export function buildReplyModal(reportId) {
  return {
    custom_id: `contact_reply_modal_${reportId}`,
    title: '返信する',
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'contact_reply_body',
          label: '返信内容',
          placeholder: '返信内容を入力してください',
          style: 2,
          required: true,
          max_length: 1000,
        }],
      },
    ],
  }
}

export function buildFollowupModal(reportId) {
  return {
    custom_id: `contact_followup_modal_${reportId}`,
    title: '返信する',
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'contact_followup_body',
          label: '返信内容',
          placeholder: '返信内容を入力してください',
          style: 2,
          required: true,
          max_length: 1000,
        }],
      },
    ],
  }
}
