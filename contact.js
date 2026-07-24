document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contactForm');
    const feedback = document.getElementById('contactFeedback');

    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('contactName').value.trim();
            const email = document.getElementById('contactEmail').value.trim();
            const message = document.getElementById('contactMessage').value.trim();

            if (!name || !email || !message) {
                feedback.textContent = 'Please fill out all fields.';
                feedback.className = 'feedback-msg error';
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                feedback.textContent = 'Please enter a valid email address.';
                feedback.className = 'feedback-msg error';
                return;
            }

            feedback.textContent = 'Thank you! Your message has been sent successfully.';
            feedback.className = 'feedback-msg success';
            contactForm.reset();
        });
    }
});
