import unittest

from logic.parser import extract_instagram_image


class InstagramThumbnailParserTests(unittest.TestCase):
    def test_prefers_video_poster_over_play_button_og_image(self):
        html = '''
        <html>
          <head>
            <meta property="og:image" content="https://images.instagram.com/play-overlay.png" />
            <meta property="og:video" content="https://video.instagram.com/clip.mp4" />
          </head>
          <body>
            <video poster="https://images.instagram.com/clean-poster.jpg"></video>
          </body>
        </html>
        '''

        self.assertEqual(
            extract_instagram_image(html),
            'https://images.instagram.com/clean-poster.jpg',
        )


if __name__ == '__main__':
    unittest.main(verbosity=2)
