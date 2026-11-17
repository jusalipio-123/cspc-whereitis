-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 17, 2026 at 05:49 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `lostfound`
--

-- --------------------------------------------------------

--
-- Table structure for table `bookmarks`
--

CREATE TABLE `bookmarks` (
  `user_id` int(11) NOT NULL,
  `report_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `bookmarks`
--

INSERT INTO `bookmarks` (`user_id`, `report_id`, `created_at`) VALUES
(5, 9, '2026-10-21 02:37:08'),
(7, 8, '2026-10-21 02:27:25'),
(7, 9, '2026-10-21 02:45:40'),
(8, 7, '2026-10-21 03:26:17'),
(9, 10, '2026-10-25 00:51:03');

-- --------------------------------------------------------

--
-- Table structure for table `categories`
--

CREATE TABLE `categories` (
  `id` int(11) NOT NULL,
  `name` varchar(60) NOT NULL,
  `slug` varchar(60) NOT NULL,
  `icon_key` varchar(40) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_other` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `categories`
--

INSERT INTO `categories` (`id`, `name`, `slug`, `icon_key`, `sort_order`, `is_other`) VALUES
(1, 'Bags', 'bags', 'bag', 10, 0),
(2, 'Gadgets', 'gadgets', 'gadget', 20, 0),
(3, 'IDs & Cards', 'ids-cards', 'id-card', 30, 0),
(4, 'Books & Documents', 'books-documents', 'book', 40, 0),
(5, 'Accessories', 'accessories', 'accessory', 50, 0),
(6, 'Clothing & Apparel', 'clothing-apparel', 'clothing', 60, 0),
(7, 'Wallets & Purses', 'wallets-purses', NULL, 70, 0),
(8, 'Keys & Keychains', 'keys-keychains', NULL, 80, 0),
(9, 'Laptops & Tablets', 'laptops-tablets', NULL, 90, 0),
(10, 'Phone & Computer Accessories', 'phone-computer-accessories', NULL, 100, 0),
(11, 'Eyeglasses & Sunglasses', 'eyeglasses-sunglasses', NULL, 110, 0),
(12, 'Jewelry & Watches', 'jewelry-watches', NULL, 120, 0),
(13, 'Umbrellas & Raincoats', 'umbrellas-raincoats', NULL, 130, 0),
(14, 'Bottles, Tumblers & Lunch Boxes', 'bottles-tumblers-lunchboxes', NULL, 140, 0),
(15, 'School & Office Supplies', 'school-office-supplies', NULL, 150, 0),
(16, 'Calculators & Drafting Tools', 'calculators-drafting-tools', NULL, 160, 0),
(17, 'Uniforms, PE & Lab Gowns', 'uniforms-pe-lab-gowns', NULL, 170, 0),
(18, 'Footwear', 'footwear', NULL, 180, 0),
(19, 'Sports Equipment', 'sports-equipment', NULL, 190, 0),
(20, 'Medical Items & Medicine', 'medical-items-medicine', NULL, 200, 0),
(21, 'Money & Payment Cards', 'money-payment-cards', NULL, 210, 0),
(22, 'Musical Instruments', 'musical-instruments', NULL, 220, 0),
(23, 'Other (please specify)', 'other', NULL, 999, 1);

-- --------------------------------------------------------

--
-- Table structure for table `claims`
--

CREATE TABLE `claims` (
  `id` int(11) NOT NULL,
  `report_id` int(11) NOT NULL,
  `claimant_user_id` int(11) NOT NULL,
  `proof_text` varchar(1000) NOT NULL,
  `distinguishing_features` varchar(500) NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `decided_by` int(11) DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `decision_note` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `claims`
--

INSERT INTO `claims` (`id`, `report_id`, `claimant_user_id`, `proof_text`, `distinguishing_features`, `status`, `decided_by`, `decided_at`, `decision_note`, `created_at`) VALUES
(2, 9, 8, 'sako talaga ni maam, promise sako talaga', 'may takla sa gedli , kulang ng turn', 'pending', NULL, NULL, NULL, '2026-10-21 03:19:26'),
(3, 9, 5, 'djsdfsjfskdcjsfsgfgvfge hello po', 'akin po ito sana ma ibalik please po', 'rejected', 7, '2026-10-21 11:29:54', 'mali mali man reason mo', '2026-10-21 03:28:26');

-- --------------------------------------------------------

--
-- Table structure for table `conversations`
--

CREATE TABLE `conversations` (
  `id` int(11) NOT NULL,
  `report_id` int(11) NOT NULL,
  `owner_user_id` int(11) NOT NULL,
  `starter_user_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_message_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `conversations`
--

INSERT INTO `conversations` (`id`, `report_id`, `owner_user_id`, `starter_user_id`, `created_at`, `last_message_at`) VALUES
(4, 7, 7, 5, '2026-10-21 02:47:02', '2026-10-21 02:48:24'),
(5, 9, 7, 5, '2026-10-21 03:27:26', '2026-10-21 03:28:50'),
(6, 10, 8, 9, '2026-10-25 00:53:38', '2026-10-25 00:53:38'),
(7, 6, 7, 9, '2026-10-25 00:54:45', '2026-10-25 00:54:45'),
(8, 11, 9, 10, '2026-10-25 01:02:46', '2026-10-25 01:09:37');

-- --------------------------------------------------------

--
-- Table structure for table `counter_sequence`
--

CREATE TABLE `counter_sequence` (
  `year` smallint(6) NOT NULL,
  `last_value` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `counter_sequence`
--

INSERT INTO `counter_sequence` (`year`, `last_value`) VALUES
(2026, 11);

-- --------------------------------------------------------

--
-- Table structure for table `locations`
--

CREATE TABLE `locations` (
  `id` int(11) NOT NULL,
  `name` varchar(120) NOT NULL,
  `zone` varchar(60) DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT 1,
  `is_other` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `locations`
--

INSERT INTO `locations` (`id`, `name`, `zone`, `is_public`, `is_other`) VALUES
(1, 'Main Gate', 'Entrance', 1, 0),
(2, 'College of Computer Studies Building', 'College of Computer Studies', 1, 0),
(3, 'Library', 'Academic', 1, 0),
(4, 'Gymnasium', 'Sports', 1, 0),
(5, 'Canteen / Food Court', 'Amenities', 1, 0),
(6, 'Administration Building', 'Admin', 1, 0),
(7, 'Side Gate / Back Gate', 'Entrance & Grounds', 1, 0),
(8, 'Guard House / Security Post', 'Entrance & Grounds', 1, 0),
(9, 'Parking Area', 'Entrance & Grounds', 1, 0),
(10, 'Motorcycle & Bicycle Parking', 'Entrance & Grounds', 1, 0),
(11, 'Tricycle Terminal / Outside Campus Gate', 'Entrance & Grounds', 1, 0),
(12, 'Graduate School Building', 'Graduate School', 1, 0),
(13, 'Graduate School - Lobby / Entrance', 'Graduate School', 1, 0),
(14, 'Graduate School - 1st Floor Hallway', 'Graduate School', 1, 0),
(15, 'Graduate School - 2nd Floor Hallway', 'Graduate School', 1, 0),
(16, 'Graduate School - 3rd Floor Hallway', 'Graduate School', 1, 0),
(17, 'Graduate School - Stairs & Landing', 'Graduate School', 1, 0),
(18, 'Graduate School - Classrooms', 'Graduate School', 1, 0),
(19, 'Graduate School - Faculty Room', 'Graduate School', 1, 0),
(20, 'Graduate School - Dean\'s Office', 'Graduate School', 1, 0),
(21, 'Graduate School - Graduate Seminar Room', 'Graduate School', 1, 0),
(22, 'CCS - Lobby / Entrance', 'College of Computer Studies', 1, 0),
(23, 'CCS - 1st Floor Hallway', 'College of Computer Studies', 1, 0),
(24, 'CCS - 2nd Floor Hallway', 'College of Computer Studies', 1, 0),
(25, 'CCS - 3rd Floor Hallway', 'College of Computer Studies', 1, 0),
(26, 'CCS - Stairs & Landing', 'College of Computer Studies', 1, 0),
(27, 'CCS - Classrooms', 'College of Computer Studies', 1, 0),
(28, 'CCS - Faculty Room', 'College of Computer Studies', 1, 0),
(29, 'CCS - Dean\'s Office', 'College of Computer Studies', 1, 0),
(30, 'CCS - Computer Laboratory', 'College of Computer Studies', 1, 0),
(31, 'College of Engineering and Architecture Building', 'College of Engineering & Architecture', 1, 0),
(32, 'CEA - Lobby / Entrance', 'College of Engineering & Architecture', 1, 0),
(33, 'CEA - 1st Floor Hallway', 'College of Engineering & Architecture', 1, 0),
(34, 'CEA - 2nd Floor Hallway', 'College of Engineering & Architecture', 1, 0),
(35, 'CEA - 3rd Floor Hallway', 'College of Engineering & Architecture', 1, 0),
(36, 'CEA - Stairs & Landing', 'College of Engineering & Architecture', 1, 0),
(37, 'CEA - Classrooms', 'College of Engineering & Architecture', 1, 0),
(38, 'CEA - Faculty Room', 'College of Engineering & Architecture', 1, 0),
(39, 'CEA - Dean\'s Office', 'College of Engineering & Architecture', 1, 0),
(40, 'CEA - Engineering & Drafting Laboratories', 'College of Engineering & Architecture', 1, 0),
(41, 'College of Health Sciences Building', 'College of Health Sciences', 1, 0),
(42, 'CHS - Lobby / Entrance', 'College of Health Sciences', 1, 0),
(43, 'CHS - 1st Floor Hallway', 'College of Health Sciences', 1, 0),
(44, 'CHS - 2nd Floor Hallway', 'College of Health Sciences', 1, 0),
(45, 'CHS - 3rd Floor Hallway', 'College of Health Sciences', 1, 0),
(46, 'CHS - Stairs & Landing', 'College of Health Sciences', 1, 0),
(47, 'CHS - Classrooms', 'College of Health Sciences', 1, 0),
(48, 'CHS - Faculty Room', 'College of Health Sciences', 1, 0),
(49, 'CHS - Dean\'s Office', 'College of Health Sciences', 1, 0),
(50, 'CHS - Nursing / Skills Laboratory', 'College of Health Sciences', 1, 0),
(51, 'College of Tourism, Hospitality and Business Management Building', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(52, 'CTHBM - Lobby / Entrance', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(53, 'CTHBM - 1st Floor Hallway', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(54, 'CTHBM - 2nd Floor Hallway', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(55, 'CTHBM - 3rd Floor Hallway', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(56, 'CTHBM - Stairs & Landing', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(57, 'CTHBM - Classrooms', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(58, 'CTHBM - Faculty Room', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(59, 'CTHBM - Dean\'s Office', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(60, 'CTHBM - Hospitality & Culinary Laboratory', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
(61, 'College of Technological and Developmental Education Building', 'College of Technological & Developmental Education', 1, 0),
(62, 'CTDE - Lobby / Entrance', 'College of Technological & Developmental Education', 1, 0),
(63, 'CTDE - 1st Floor Hallway', 'College of Technological & Developmental Education', 1, 0),
(64, 'CTDE - 2nd Floor Hallway', 'College of Technological & Developmental Education', 1, 0),
(65, 'CTDE - 3rd Floor Hallway', 'College of Technological & Developmental Education', 1, 0),
(66, 'CTDE - Stairs & Landing', 'College of Technological & Developmental Education', 1, 0),
(67, 'CTDE - Classrooms', 'College of Technological & Developmental Education', 1, 0),
(68, 'CTDE - Faculty Room', 'College of Technological & Developmental Education', 1, 0),
(69, 'CTDE - Dean\'s Office', 'College of Technological & Developmental Education', 1, 0),
(70, 'CTDE - Technology Shops & Workshops', 'College of Technological & Developmental Education', 1, 0),
(71, 'College of Arts and Sciences Building', 'College of Arts & Sciences', 1, 0),
(72, 'CAS - Lobby / Entrance', 'College of Arts & Sciences', 1, 0),
(73, 'CAS - 1st Floor Hallway', 'College of Arts & Sciences', 1, 0),
(74, 'CAS - 2nd Floor Hallway', 'College of Arts & Sciences', 1, 0),
(75, 'CAS - 3rd Floor Hallway', 'College of Arts & Sciences', 1, 0),
(76, 'CAS - Stairs & Landing', 'College of Arts & Sciences', 1, 0),
(77, 'CAS - Classrooms', 'College of Arts & Sciences', 1, 0),
(78, 'CAS - Faculty Room', 'College of Arts & Sciences', 1, 0),
(79, 'CAS - Dean\'s Office', 'College of Arts & Sciences', 1, 0),
(80, 'CAS - Science Laboratory', 'College of Arts & Sciences', 1, 0),
(81, 'Office of the President', 'Administration & Offices', 1, 0),
(82, 'Office of the Vice Presidents', 'Administration & Offices', 1, 0),
(83, 'Registrar (Student Registration and Records)', 'Administration & Offices', 1, 0),
(84, 'Student Testing and Admission Office', 'Administration & Offices', 1, 0),
(85, 'Cashier (Cash Unit)', 'Administration & Offices', 1, 0),
(86, 'Accounting & Budget Unit', 'Administration & Offices', 1, 0),
(87, 'Supply and Property Management Unit', 'Administration & Offices', 1, 0),
(88, 'Human Resource Management Unit', 'Administration & Offices', 1, 0),
(89, 'Records and FOI Unit', 'Administration & Offices', 1, 0),
(90, 'General Services Unit', 'Administration & Offices', 1, 0),
(91, 'ICT Unit / Server Room', 'Administration & Offices', 1, 0),
(92, 'Information and Alumni Affairs Office', 'Administration & Offices', 1, 0),
(93, 'Student Affairs Services', 'Student Services', 1, 0),
(94, 'Guidance Counseling Office', 'Student Services', 1, 0),
(95, 'Health Services Unit (Clinic)', 'Student Services', 1, 0),
(96, 'Sports Development Office', 'Student Services', 1, 0),
(97, 'Cultural Affairs / Center for Rinconada Culture and the Arts', 'Student Services', 1, 0),
(98, 'NSTP Office', 'Student Services', 1, 0),
(99, 'Competency and Assessment Center', 'Student Services', 1, 0),
(100, 'Academic Center for Continuing Enrichment for Students (ACCESS)', 'Student Services', 1, 0),
(101, 'Center for Quality Assurance', 'Student Services', 1, 0),
(102, 'Student Organizations / Student Council Office', 'Student Services', 1, 0),
(103, 'Library - Reading Area', 'Library & Research', 1, 0),
(104, 'Library - Computer / Internet Area', 'Library & Research', 1, 0),
(105, 'Learning Resources and Development Office', 'Library & Research', 1, 0),
(106, 'Research and Development Services Office', 'Library & Research', 1, 0),
(107, 'Extension and Community Services Office', 'Library & Research', 1, 0),
(108, 'Production and Auxiliary Services', 'Library & Research', 1, 0),
(109, 'Covered Court', 'Common Areas', 1, 0),
(110, 'Oval / Track and Field', 'Common Areas', 1, 0),
(111, 'Open Court / Basketball Court', 'Common Areas', 1, 0),
(112, 'Quadrangle / Open Plaza', 'Common Areas', 1, 0),
(113, 'Flagpole Area', 'Common Areas', 1, 0),
(114, 'Auditorium / Function Hall', 'Common Areas', 1, 0),
(115, 'Chapel / Prayer Room', 'Common Areas', 1, 0),
(116, 'Food Stalls', 'Common Areas', 1, 0),
(117, 'Waiting Shed / Student Lounge', 'Common Areas', 1, 0),
(118, 'Covered Walkway', 'Common Areas', 1, 0),
(119, 'Main Hallway / Corridor', 'Common Areas', 1, 0),
(120, 'Comfort Rooms (CR)', 'Common Areas', 1, 0),
(121, 'Garden / Benches', 'Common Areas', 1, 0),
(122, 'Other location (please specify)', 'Other', 1, 1);

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `id` int(11) NOT NULL,
  `conversation_id` int(11) NOT NULL,
  `sender_user_id` int(11) NOT NULL,
  `body` varchar(1000) NOT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `messages`
--

INSERT INTO `messages` (`id`, `conversation_id`, `sender_user_id`, `body`, `read_at`, `created_at`) VALUES
(6, 4, 5, 'I found this', '2026-10-21 10:49:28', '2026-10-21 02:47:02'),
(7, 4, 5, 'hi', '2026-10-21 10:49:28', '2026-10-21 02:48:24'),
(8, 5, 5, 'hello po', '2026-10-21 11:28:46', '2026-10-21 03:27:26'),
(9, 5, 7, 'hi', NULL, '2026-10-21 03:28:50'),
(10, 6, 9, 'hindi ko po nakita to,. sorry', NULL, '2026-10-25 00:53:38'),
(11, 7, 9, 'I found this', NULL, '2026-10-25 00:54:45'),
(12, 8, 10, 'I found this', '2026-10-25 09:03:56', '2026-10-25 01:02:46'),
(13, 8, 10, 'joke', '2026-10-25 09:03:56', '2026-10-25 01:02:54'),
(14, 8, 9, 'suntukan', '2026-10-25 09:04:49', '2026-10-25 01:04:28'),
(15, 8, 10, 'tara ukininammm!!', '2026-10-25 09:08:40', '2026-10-25 01:04:59'),
(16, 8, 10, 'jsjkbfsdfbd', '2026-10-25 09:08:40', '2026-10-25 01:05:17'),
(17, 8, 10, 'kininamo', '2026-10-25 09:08:40', '2026-10-25 01:05:25'),
(18, 8, 10, 'joke, nakita ko talaga fr', '2026-10-25 09:08:40', '2026-10-25 01:08:21'),
(19, 8, 9, 'edi ibalik mo sakin bwisit ka', '2026-11-17 12:47:45', '2026-10-25 01:08:50'),
(20, 8, 9, 'suntukan tayo', '2026-11-17 12:47:45', '2026-10-25 01:08:56'),
(21, 8, 9, 'location, meetup sa gym sabay suntukan ha', '2026-11-17 12:47:45', '2026-10-25 01:09:17'),
(22, 8, 9, 'sunday', '2026-11-17 12:47:45', '2026-10-25 01:09:26'),
(23, 8, 9, '11:23 AM', '2026-11-17 12:47:45', '2026-10-25 01:09:37');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `type` enum('claim_filed','claim_decided','status_changed','message_received','comment_added') NOT NULL,
  `report_id` int(11) DEFAULT NULL,
  `body` varchar(255) NOT NULL,
  `link` varchar(200) NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `user_id`, `type`, `report_id`, `body`, `link`, `is_read`, `created_at`) VALUES
(8, 7, 'message_received', 7, 'Someone says they found your lost item: Leather wallet (LF-2026-0007)', '/messages/4', 1, '2026-10-21 02:47:02'),
(9, 7, 'message_received', 7, 'New message about LF-2026-0007', '/messages/4', 1, '2026-10-21 02:48:24'),
(10, 7, 'claim_filed', 9, 'Someone filed a claim on LF-2026-0009 (watch)', '/reports/LF-2026-0009', 0, '2026-10-21 03:19:26'),
(11, 7, 'message_received', 9, 'New message about LF-2026-0009', '/messages/5', 1, '2026-10-21 03:27:26'),
(12, 7, 'claim_filed', 9, 'Someone filed a claim on LF-2026-0009 (watch)', '/reports/LF-2026-0009', 0, '2026-10-21 03:28:26'),
(13, 5, 'message_received', 9, 'New message about LF-2026-0009', '/messages/5', 0, '2026-10-21 03:28:50'),
(14, 5, 'claim_decided', 9, 'Your claim on LF-2026-0009 was not approved', '/claims/3', 1, '2026-10-21 03:29:54'),
(15, 8, 'comment_added', 10, 'New comment on LF-2026-0010 (45 inch na tv)', '/reports/LF-2026-0010#comments', 0, '2026-10-25 00:52:54'),
(16, 8, 'message_received', 10, 'New message about LF-2026-0010', '/messages/6', 0, '2026-10-25 00:53:38'),
(17, 7, 'message_received', 6, 'Someone says they found your lost item: samsung galaxy (LF-2026-0006)', '/messages/7', 0, '2026-10-25 00:54:45'),
(18, 9, 'comment_added', 11, 'New comment on LF-2026-0011 (my heart ouchhhh ugh)', '/reports/LF-2026-0011#comments', 1, '2026-10-25 01:02:39'),
(19, 9, 'message_received', 11, 'Someone says they found your lost item: my heart ouchhhh ugh (LF-2026-0011)', '/messages/8', 1, '2026-10-25 01:02:46'),
(20, 9, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:02:54'),
(21, 10, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:04:28'),
(22, 9, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:04:59'),
(23, 9, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:05:17'),
(24, 9, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:05:25'),
(25, 9, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:08:21'),
(26, 10, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:08:50'),
(27, 10, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:08:56'),
(28, 10, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:09:17'),
(29, 10, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:09:26'),
(30, 10, 'message_received', 11, 'New message about LF-2026-0011', '/messages/8', 1, '2026-10-25 01:09:37');

-- --------------------------------------------------------

--
-- Table structure for table `reports`
--

CREATE TABLE `reports` (
  `id` int(11) NOT NULL,
  `reference_no` varchar(20) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `submitter_type` enum('registered','guest') NOT NULL DEFAULT 'registered',
  `moderation_status` enum('approved','pending','rejected') NOT NULL DEFAULT 'approved',
  `moderated_by` int(11) DEFAULT NULL,
  `moderated_at` datetime DEFAULT NULL,
  `moderation_note` varchar(255) DEFAULT NULL,
  `guest_contact_name` varchar(120) DEFAULT NULL,
  `guest_contact_email` varchar(160) DEFAULT NULL,
  `guest_contact_phone` varchar(20) DEFAULT NULL,
  `submitter_ip_hash` char(64) DEFAULT NULL,
  `kind` enum('lost','found') NOT NULL,
  `category_id` int(11) NOT NULL,
  `category_other` varchar(60) DEFAULT NULL,
  `location_id` int(11) NOT NULL,
  `location_other` varchar(120) DEFAULT NULL,
  `title` varchar(120) NOT NULL,
  `description` varchar(1000) NOT NULL,
  `occurred_on` date NOT NULL,
  `holding_location` varchar(160) DEFAULT NULL,
  `photo_url` varchar(500) DEFAULT NULL,
  `status` enum('open','matched','claimed','returned','archived') NOT NULL DEFAULT 'open',
  `archived_reason` varchar(255) DEFAULT NULL,
  `returned_to` varchar(120) DEFAULT NULL,
  `returned_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

--
-- Dumping data for table `reports`
--

INSERT INTO `reports` (`id`, `reference_no`, `user_id`, `submitter_type`, `moderation_status`, `moderated_by`, `moderated_at`, `moderation_note`, `guest_contact_name`, `guest_contact_email`, `guest_contact_phone`, `submitter_ip_hash`, `kind`, `category_id`, `category_other`, `location_id`, `location_other`, `title`, `description`, `occurred_on`, `holding_location`, `photo_url`, `status`, `archived_reason`, `returned_to`, `returned_at`, `created_at`, `updated_at`) VALUES
(6, 'LF-2026-0006', 7, 'registered', 'approved', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'lost', 2, NULL, 3, NULL, 'samsung galaxy', 'kulay gold po, samsung galaxy curve baka po nakita nyo po..', '2026-10-21', NULL, '/uploads/1cb377eeca1412e42b010b5f4adb2766.jpg', 'open', NULL, NULL, NULL, '2026-10-20 23:50:53', '2026-10-20 23:50:53'),
(7, 'LF-2026-0007', 7, 'registered', 'approved', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'lost', 7, NULL, 9, NULL, 'Leather wallet', 'color brown leather wallet po huhuhu', '2026-10-21', NULL, '/uploads/e714150589e389e4931711d3d245ab92.webp', 'open', NULL, NULL, NULL, '2026-10-20 23:53:21', '2026-10-20 23:53:21'),
(8, 'LF-2026-0008', 7, 'registered', 'approved', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'found', 12, NULL, 85, NULL, 'diamond necklace', 'diamond necklace, di ko po alam description nito basta contact me nalang po', '2026-10-21', 'nasakin po', '/uploads/962bafdbf2a746319dd58790ca97f73f.webp', 'open', NULL, NULL, NULL, '2026-10-20 23:54:33', '2026-10-20 23:54:33'),
(9, 'LF-2026-0009', 7, 'registered', 'approved', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'found', 5, NULL, 76, NULL, 'watch', 'brown watch, mukhang mamahalin kita nang lubos. claim it', '2026-10-21', 'saakin', '/uploads/f22bc56bb469c71210911ef7b3ea3ef9.webp', 'open', NULL, NULL, NULL, '2026-10-20 23:56:03', '2026-10-20 23:56:03'),
(10, 'LF-2026-0010', 8, 'registered', 'approved', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'lost', 2, NULL, 86, NULL, '45 inch na tv', 'color pink, may keychain na kasing laki ng id', '2026-10-21', NULL, '/uploads/560e4e5cdff589a13d2133aa269033f8.webp', 'open', NULL, NULL, NULL, '2026-10-21 03:21:58', '2026-10-21 03:21:58'),
(11, 'LF-2026-0011', 9, 'registered', 'approved', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'lost', 23, 'durugo ang poso', 122, 'binenta na. di ko alam kung saan', 'my heart ouchhhh ugh', 'kasing laki daw ng fist ang puso according to studies eh shet ouch owemji', '2026-10-25', NULL, '/uploads/daebb5d5609116c32d4ff1c18a23e77a.webp', 'archived', 'withdrawn by owner', NULL, NULL, '2026-10-25 00:59:18', '2026-10-25 01:10:12');

-- --------------------------------------------------------

--
-- Table structure for table `report_comments`
--

CREATE TABLE `report_comments` (
  `id` int(11) NOT NULL,
  `report_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `body` varchar(500) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `report_comments`
--

INSERT INTO `report_comments` (`id`, `report_id`, `user_id`, `body`, `created_at`) VALUES
(6, 6, 7, 'pa message nalang if nakita nyo', '2026-10-20 23:51:11'),
(7, 6, 7, 'pa message nalang if nakita nyo', '2026-10-20 23:51:11'),
(8, 6, 7, '...', '2026-10-20 23:51:32'),
(9, 10, 9, 'hello baby', '2026-10-25 00:52:54'),
(10, 11, 9, 'saket mo ate', '2026-10-25 01:00:09'),
(11, 11, 10, 'jejjemon  amp', '2026-10-25 01:02:39');

-- --------------------------------------------------------

--
-- Table structure for table `report_status_history`
--

CREATE TABLE `report_status_history` (
  `id` int(11) NOT NULL,
  `report_id` int(11) NOT NULL,
  `from_status` varchar(20) DEFAULT NULL,
  `to_status` varchar(20) NOT NULL,
  `changed_by` int(11) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `changed_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `report_status_history`
--

INSERT INTO `report_status_history` (`id`, `report_id`, `from_status`, `to_status`, `changed_by`, `note`, `changed_at`) VALUES
(3, 11, 'open', 'archived', 9, 'withdrawn by owner', '2026-10-25 01:10:12');

-- --------------------------------------------------------

--
-- Table structure for table `report_tags`
--

CREATE TABLE `report_tags` (
  `report_id` int(11) NOT NULL,
  `tag_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tags`
--

CREATE TABLE `tags` (
  `id` int(11) NOT NULL,
  `slug` varchar(40) NOT NULL,
  `label` varchar(60) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `tags`
--

INSERT INTO `tags` (`id`, `slug`, `label`, `sort_order`) VALUES
(1, 'urgent', 'Urgent', 1),
(2, 'electronics', 'Electronics', 2),
(3, 'documents', 'Documents', 3),
(4, 'clothing', 'Clothing', 4),
(5, 'accessories', 'Accessories', 5);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `student_no` varchar(20) NOT NULL,
  `full_name` varchar(120) NOT NULL,
  `email` varchar(160) NOT NULL,
  `pin_salt` char(32) NOT NULL,
  `pin_hash` char(64) NOT NULL,
  `contact_no` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `student_no`, `full_name`, `email`, `pin_salt`, `pin_hash`, `contact_no`, `created_at`) VALUES
(1, '21212121', 'assawaa', 'vihermoso@my.cspc.edu.ph', '02d725372cbb1d75abb1b5f017dbac74', '5f6f0a0563eea16a813c43d4a5b639a8ab97410535670ac7c603bb7df6803ccf', NULL, '2026-10-20 02:19:22'),
(2, '1111111', 'rrrrrrrrrrrrrrrrrrrr', 'binsent@my.cspc.edu.ph', 'c0a698c2fc14426c672928264382235b', 'ff437f725580bfa418e227edf36968a7b8f32ae7e5ee4671efa1e4a2df87e171', NULL, '2026-10-20 02:29:36'),
(3, '7654321', 'heraa', 'binsentt@my.cspc.edu.ph', '6ae65bad881f9a76f6c567808b52a916', 'cb23872b843eda285b806e06405e8cdfea5fe054e23c72c71b77c24530abdd6e', NULL, '2026-10-20 23:15:12'),
(4, '00000000', 'juan de la cruz', 'vihermosooo@my.cspc.edu.ph', '67573055b3976168b6a3affceb785466', 'd942c8b89f8c46d00f3e1763cf65c3f0e43442020352341b399882e2ae2bf23f', NULL, '2026-10-20 23:20:19'),
(5, '2410050', 'Jusminne Alipio', 'jusalipio@my.cspc.edu.ph', 'ddadd97b78727f4909a1c9fc85be6c08', 'cbfba94e2c38cb8dc7b788afd5b0efae5304b6e0514e60e163710397dcec2c79', NULL, '2026-10-20 23:30:21'),
(6, '2411057', 'Angel Charm', 'anrabino@my.cspc.edu.ph', '70a8792c416081628c8920c2b13876d8', 'a819f65746c9022c3091e2ef848bf7ebb3a048aa53efaeac5753d6cf7ebe27ca', NULL, '2026-10-20 23:31:25'),
(7, '2410962', 'Vincent Wafu', 'vihermosoo@my.cspc.edu.ph', '466cc1e26618a8b339ccbcf11db225e7', '6fe951e9f684364eecaa8ca9ca2032b82875f43ffaed90ea9045b820f9e748ee', NULL, '2026-10-20 23:34:31'),
(8, '2411111', 'Carmel Sumpay', 'casumpay@my.cspc.edu.ph', '5f17ab2e5c8d56a40861a90930503236', '41880c601b5f18ac5813fd20368ae7d4621566c8b040a9753c0c4840f4d0a9b6', NULL, '2026-10-21 03:18:01'),
(9, '2222222', 'aaaa', 'aaaa@my.cspc.edu.ph', 'ebf0570b0cd3dfc2c5f3fb3445093a70', '3a6a7a105b9b0647024dd607ae92b234cb4a3e7bfdabd5a29fa88812970d1d4c', NULL, '2026-10-25 00:49:35'),
(10, '3333333', 'eeeeeee', 'eeee@my.cspc.edu.ph', '37398de8c167e2e9132dadc6f8a97753', 'e820665bbcacfbdba33b840a6cd32426b4a8dcd9d4f1c421c295cb976219cddc', NULL, '2026-10-25 01:02:07');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `bookmarks`
--
ALTER TABLE `bookmarks`
  ADD PRIMARY KEY (`user_id`,`report_id`),
  ADD KEY `fk_bookmarks_report` (`report_id`);

--
-- Indexes for table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_categories_name` (`name`),
  ADD UNIQUE KEY `uniq_categories_slug` (`slug`);

--
-- Indexes for table `claims`
--
ALTER TABLE `claims`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_claim_per_user` (`report_id`,`claimant_user_id`),
  ADD KEY `fk_claims_claimant` (`claimant_user_id`),
  ADD KEY `fk_claims_decided_by` (`decided_by`),
  ADD KEY `idx_claims_status` (`status`);

--
-- Indexes for table `conversations`
--
ALTER TABLE `conversations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_conversation` (`report_id`,`starter_user_id`),
  ADD KEY `idx_conversations_owner` (`owner_user_id`,`last_message_at`),
  ADD KEY `idx_conversations_starter` (`starter_user_id`,`last_message_at`);

--
-- Indexes for table `counter_sequence`
--
ALTER TABLE `counter_sequence`
  ADD PRIMARY KEY (`year`);

--
-- Indexes for table `locations`
--
ALTER TABLE `locations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_locations_name` (`name`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_messages_sender` (`sender_user_id`),
  ADD KEY `idx_messages_conversation` (`conversation_id`,`created_at`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_notifications_report` (`report_id`),
  ADD KEY `idx_notifications_user_unread` (`user_id`,`is_read`,`created_at`);

--
-- Indexes for table `reports`
--
ALTER TABLE `reports`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_reports_reference_no` (`reference_no`),
  ADD KEY `fk_reports_moderated_by` (`moderated_by`),
  ADD KEY `fk_reports_location` (`location_id`),
  ADD KEY `idx_reports_kind_status` (`kind`,`status`),
  ADD KEY `idx_reports_category_date` (`category_id`,`occurred_on`),
  ADD KEY `idx_reports_user` (`user_id`),
  ADD KEY `idx_reports_moderation` (`moderation_status`,`submitter_type`),
  ADD KEY `idx_reports_ip_created` (`submitter_ip_hash`,`created_at`);

--
-- Indexes for table `report_comments`
--
ALTER TABLE `report_comments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_comments_report` (`report_id`),
  ADD KEY `fk_comments_user` (`user_id`);

--
-- Indexes for table `report_status_history`
--
ALTER TABLE `report_status_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_history_report` (`report_id`),
  ADD KEY `fk_history_changed_by` (`changed_by`);

--
-- Indexes for table `report_tags`
--
ALTER TABLE `report_tags`
  ADD PRIMARY KEY (`report_id`,`tag_id`),
  ADD KEY `idx_report_tags_tag` (`tag_id`);

--
-- Indexes for table `tags`
--
ALTER TABLE `tags`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `slug` (`slug`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_users_student_no` (`student_no`),
  ADD UNIQUE KEY `uniq_users_email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=24;

--
-- AUTO_INCREMENT for table `claims`
--
ALTER TABLE `claims`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `conversations`
--
ALTER TABLE `conversations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `locations`
--
ALTER TABLE `locations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=123;

--
-- AUTO_INCREMENT for table `messages`
--
ALTER TABLE `messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=24;

--
-- AUTO_INCREMENT for table `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=31;

--
-- AUTO_INCREMENT for table `reports`
--
ALTER TABLE `reports`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `report_comments`
--
ALTER TABLE `report_comments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `report_status_history`
--
ALTER TABLE `report_status_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `tags`
--
ALTER TABLE `tags`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `bookmarks`
--
ALTER TABLE `bookmarks`
  ADD CONSTRAINT `fk_bookmarks_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_bookmarks_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `claims`
--
ALTER TABLE `claims`
  ADD CONSTRAINT `fk_claims_claimant` FOREIGN KEY (`claimant_user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_claims_decided_by` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_claims_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `conversations`
--
ALTER TABLE `conversations`
  ADD CONSTRAINT `fk_conversations_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_conversations_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_conversations_starter` FOREIGN KEY (`starter_user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `fk_messages_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notifications_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `reports`
--
ALTER TABLE `reports`
  ADD CONSTRAINT `fk_reports_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`),
  ADD CONSTRAINT `fk_reports_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`),
  ADD CONSTRAINT `fk_reports_moderated_by` FOREIGN KEY (`moderated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_reports_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `report_comments`
--
ALTER TABLE `report_comments`
  ADD CONSTRAINT `fk_comments_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Constraints for table `report_status_history`
--
ALTER TABLE `report_status_history`
  ADD CONSTRAINT `fk_history_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `fk_history_report` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `report_tags`
--
ALTER TABLE `report_tags`
  ADD CONSTRAINT `report_tags_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `report_tags_ibfk_2` FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
