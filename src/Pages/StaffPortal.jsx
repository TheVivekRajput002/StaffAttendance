import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient'

const StaffPortal = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [staffData, setStaffData] = useState(null);
    const [activeTab, setActiveTab] = useState('attendance');

    // Login states
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');

    // Attendance states

    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [monthAttendance, setMonthAttendance] = useState([]);
    const [attendanceStatus, setAttendanceStatus] = useState('present');
    const [attendanceHistory, setAttendanceHistory] = useState([]);
    const [todayAttendance, setTodayAttendance] = useState(null);

    // Salary states
    const [currentMonthSalary, setCurrentMonthSalary] = useState(null);
    const [advances, setAdvances] = useState([]);
    const [salaryLoading, setSalaryLoading] = useState(false);

    const fetchMonthAttendance = async (month) => {
        const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).toISOString().split('T')[0];
        const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).toISOString().split('T')[0];

        const { data } = await supabase
            .from('attendance')
            .select('*')
            .eq('staff_id', staffData.id)
            .gte('date', firstDay)
            .lte('date', lastDay);

        setMonthAttendance(data || []);
    };

    // Check authentication on mount
    useEffect(() => {
        checkUser();
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user || null);
            if (session?.user) {
                fetchStaffData(session.user.id);
            }
        });
    }, []);

    // Fetch data when staff data is available
    useEffect(() => {
        if (staffData) {
            fetchAttendanceHistory();
            fetchTodayAttendance();
            fetchSalaryData();
            fetchMonthAttendance(currentMonth);
        }
    }, [staffData]);

    useEffect(() => {
        if (staffData) {
            fetchMonthAttendance(currentMonth);
        }
    }, [currentMonth, staffData]);

    const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user || null);
        if (session?.user) {
            await fetchStaffData(session.user.id);
        }
        setLoading(false);
    };

    const fetchStaffData = async (userId) => {
        const { data, error } = await supabase
            .from('staff')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (data) setStaffData(data);
    };

    const handleLogin = async () => {
        setLoginError('');
        setLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setLoginError(error.message);
            setLoading(false);
        } else {
            setUser(data.user);
            await fetchStaffData(data.user.id);
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setStaffData(null);
    };

    const fetchTodayAttendance = async () => {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
            .from('attendance')
            .select('*')
            .eq('staff_id', staffData.id)
            .eq('date', today)
            .single();

        setTodayAttendance(data);
    };

    const fetchAttendanceHistory = async () => {
        const { data } = await supabase
            .from('attendance')
            .select('*')
            .eq('staff_id', staffData.id)
            .order('date', { ascending: false })
            .limit(10);

        setAttendanceHistory(data || []);
    };

    const markAttendance = async () => {
        if (!staffData) return;

        // Only allow marking today's attendance
        const today = new Date().toISOString().split('T')[0];
        if (selectedDate !== today) {
            alert('You can only mark attendance for today!');
            return;
        }

        const { data, error } = await supabase
            .from('attendance')
            .upsert({
                staff_id: staffData.id,
                date: selectedDate,
                status: attendanceStatus,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'staff_id,date'
            });

        if (!error) {
            alert('Attendance marked successfully!');
            fetchAttendanceHistory();
            fetchTodayAttendance();
            fetchSalaryData();
            fetchMonthAttendance(currentMonth);
        } else {
            alert('Error marking attendance: ' + error.message);
        }
    };

    const fetchSalaryData = async () => {
        setSalaryLoading(true);
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        // Fetch attendance for current month
        const firstDay = new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0];
        const lastDay = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

        const { data: attendanceData } = await supabase
            .from('attendance')
            .select('*')
            .eq('staff_id', staffData.id)
            .gte('date', firstDay)
            .lte('date', lastDay);

        // Fetch advances for current month
        const { data: advancesData } = await supabase
            .from('salary_advances')
            .select('*')
            .eq('staff_id', staffData.id)
            .gte('advance_date', firstDay)
            .lte('advance_date', lastDay);

        setAdvances(advancesData || []);

        // Calculate salary
        const totalDays = new Date(currentYear, currentMonth, 0).getDate();
        const presentDays = attendanceData?.filter(a => a.status === 'present').length || 0;
        const halfDays = attendanceData?.filter(a => a.status === 'half_day').length || 0;
        const absentDays = attendanceData?.filter(a => a.status === 'absent').length || 0;

        const perDaySalary = staffData.monthly_salary / totalDays;
        const halfDayDeduction = halfDays * (perDaySalary * 0.5);
        const absentDeduction = absentDays * perDaySalary;
        const totalAdvances = advancesData?.reduce((sum, adv) => sum + parseFloat(adv.amount), 0) || 0;
        const netSalary = staffData.monthly_salary - halfDayDeduction - absentDeduction - totalAdvances;

        setCurrentMonthSalary({
            month: currentMonth,
            year: currentYear,
            baseSalary: staffData.monthly_salary,
            totalDays,
            presentDays,
            halfDays,
            absentDays,
            perDaySalary,
            halfDayDeduction,
            absentDeduction,
            totalAdvances,
            netSalary
        });

        setSalaryLoading(false);
    };

    // Login Screen
    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                <div className="text-xl text-gray-600">Loading...</div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md"
                >
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-800 mb-2">Staff Portal</h1>
                        <p className="text-gray-600">Login to access your dashboard</p>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Email Address
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                                placeholder="your.email@company.com"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                                placeholder="••••••••"
                            />
                        </div>

                        {loginError && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="bg-red-50 text-red-600 p-3 rounded-lg text-sm"
                            >
                                {loginError}
                            </motion.div>
                        )}

                        <button
                            onClick={handleLogin}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition duration-200 transform hover:scale-[1.02]"
                        >
                            Sign In
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    // Dashboard
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
            {/* Header */}
            <motion.header
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-white shadow-md"
            >
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Welcome, {staffData?.full_name}</h1>
                        <p className="text-sm text-gray-600">{staffData?.designation}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                    >
                        Logout
                    </button>
                </div>
            </motion.header>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Tabs */}
                <div className="flex space-x-4 mb-8">
                    {['attendance', 'salary'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-6 py-3 rounded-lg font-semibold transition ${activeTab === tab
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {/* Attendance Tab */}
                    {activeTab === 'attendance' && (
                        <motion.div
                            key="attendance"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-6"
                        >
                            <div className='lg:grid lg:grid-cols-3 lg:gap-2 '>

                                {/* Mark Attendance - Today Only */}
                                <div className="bg-white rounded-xl shadow-lg p-6 col-span-1">
                                    <h2 className="text-2xl font-bold text-gray-800 mb-6">Mark Today's Attendance</h2>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Date (Today Only)
                                            </label>
                                            <input
                                                type="date"
                                                value={selectedDate}
                                                readOnly
                                                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">You can only mark attendance for today</p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Status
                                            </label>
                                            <div className="grid grid-cols-3 gap-3">
                                                {['present', 'half_day', 'absent'].map((status) => (
                                                    <button
                                                        key={status}
                                                        onClick={() => setAttendanceStatus(status)}
                                                        className={`py-3 px-4 rounded-lg font-medium transition ${attendanceStatus === status
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                            }`}
                                                    >
                                                        {status === 'half_day' ? 'Half Day' : status.charAt(0).toUpperCase() + status.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <button
                                            onClick={markAttendance}
                                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
                                        >
                                            Submit Attendance
                                        </button>
                                    </div>
                                </div>

                                {/* Calendar View */}
                                <div className="bg-white rounded-xl shadow-lg p-6 mt-2 lg:col-span-2">
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-2xl font-bold text-gray-800">Attendance Calendar</h2>
                                        <div className="flex items-center space-x-3">
                                            <button
                                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                                            >
                                                ←
                                            </button>
                                            <span className="font-semibold text-gray-700">
                                                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                            </span>
                                            <button
                                                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                                            >
                                                →
                                            </button>
                                        </div>
                                    </div>

                                    {/* Calendar Grid */}
                                    <div className="grid grid-cols-7 gap-2">
                                        {/* Day Headers */}
                                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                                            <div key={day} className="text-center font-semibold text-gray-600 py-2">
                                                {day}
                                            </div>
                                        ))}

                                        {/* Calendar Days */}
                                        {(() => {
                                            const year = currentMonth.getFullYear();
                                            const month = currentMonth.getMonth();
                                            const firstDay = new Date(year, month, 1).getDay();
                                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                                            const days = [];

                                            // Empty cells before first day
                                            for (let i = 0; i < firstDay; i++) {
                                                days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
                                            }

                                            // Days of month
                                            for (let day = 1; day <= daysInMonth; day++) {
                                                const dateStr = new Date(year, month, day).toISOString().split('T')[0];
                                                const attendance = monthAttendance.find(a => a.date === dateStr);
                                                const isToday = dateStr === new Date().toISOString().split('T')[0];

                                                days.push(
                                                    <div
                                                        key={day}
                                                        className={`aspect-square flex flex-col items-center justify-center rounded-lg border-2 transition ${isToday ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                                            } ${attendance?.status === 'present'
                                                                ? 'bg-green-100'
                                                                : attendance?.status === 'half_day'
                                                                    ? 'bg-yellow-100'
                                                                    : attendance?.status === 'absent'
                                                                        ? 'bg-red-100'
                                                                        : 'bg-white'
                                                            }`}
                                                    >
                                                        <span className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>
                                                            {day}
                                                        </span>
                                                        {attendance && (
                                                            <span className="text-xs mt-1">
                                                                {attendance.status === 'present' ? '✓' : attendance.status === 'half_day' ? 'H' : 'X'}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            return days;
                                        })()}
                                    </div>

                                    {/* Legend */}
                                    <div className="flex justify-center space-x-6 mt-6 text-sm">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-4 h-4 bg-green-100 border border-green-200 rounded"></div>
                                            <span className="text-gray-600">Present</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-4 h-4 bg-yellow-100 border border-yellow-200 rounded"></div>
                                            <span className="text-gray-600">Half Day</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-4 h-4 bg-red-100 border border-red-200 rounded"></div>
                                            <span className="text-gray-600">Absent</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <div className="w-4 h-4 bg-blue-50 border-2 border-blue-500 rounded"></div>
                                            <span className="text-gray-600">Today</span>
                                        </div>
                                    </div>
                                </div>
                            </div>


                        </motion.div>
                    )}

                    {/* Salary Tab */}
                    {activeTab === 'salary' && (
                        <motion.div
                            key="salary"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-6"
                        >
                            {salaryLoading ? (
                                <div className="text-center py-12">Loading salary data...</div>
                            ) : currentMonthSalary ? (
                                <>
                                    {/* Salary Overview */}
                                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg p-8 text-white">
                                        <h2 className="text-xl font-semibold mb-2">
                                            {new Date(currentMonthSalary.year, currentMonthSalary.month - 1).toLocaleDateString('en-US', {
                                                month: 'long',
                                                year: 'numeric'
                                            })} Salary
                                        </h2>
                                        <p className="text-5xl font-bold mb-2">₹{currentMonthSalary.netSalary.toFixed(2)}</p>
                                        <p className="text-blue-100">Net Salary</p>
                                    </div>

                                    {/* Salary Breakdown */}
                                    <div className="bg-white rounded-xl shadow-lg p-6">
                                        <h3 className="text-xl font-bold text-gray-800 mb-6">Salary Breakdown</h3>

                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center pb-4 border-b">
                                                <span className="text-gray-600">Base Salary</span>
                                                <span className="font-semibold text-gray-800">₹{currentMonthSalary.baseSalary.toFixed(2)}</span>
                                            </div>

                                            <div className="flex justify-between items-center pb-4 border-b">
                                                <span className="text-gray-600">Total Working Days</span>
                                                <span className="font-semibold text-gray-800">{currentMonthSalary.totalDays} days</span>
                                            </div>

                                            <div className="grid grid-cols-3 gap-4 pb-4 border-b">
                                                <div className="text-center">
                                                    <p className="text-2xl font-bold text-green-600">{currentMonthSalary.presentDays}</p>
                                                    <p className="text-sm text-gray-600">Present</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-2xl font-bold text-yellow-600">{currentMonthSalary.halfDays}</p>
                                                    <p className="text-sm text-gray-600">Half Days</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-2xl font-bold text-red-600">{currentMonthSalary.absentDays}</p>
                                                    <p className="text-sm text-gray-600">Absent</p>
                                                </div>
                                            </div>

                                            {currentMonthSalary.halfDayDeduction > 0 && (
                                                <div className="flex justify-between items-center text-red-600">
                                                    <span>Half Day Deduction</span>
                                                    <span className="font-semibold">- ₹{currentMonthSalary.halfDayDeduction.toFixed(2)}</span>
                                                </div>
                                            )}

                                            {currentMonthSalary.absentDeduction > 0 && (
                                                <div className="flex justify-between items-center text-red-600">
                                                    <span>Absent Deduction</span>
                                                    <span className="font-semibold">- ₹{currentMonthSalary.absentDeduction.toFixed(2)}</span>
                                                </div>
                                            )}

                                            {currentMonthSalary.totalAdvances > 0 && (
                                                <div className="flex justify-between items-center text-red-600">
                                                    <span>Total Advances</span>
                                                    <span className="font-semibold">- ₹{currentMonthSalary.totalAdvances.toFixed(2)}</span>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center pt-4 border-t-2 border-gray-300">
                                                <span className="font-bold text-gray-800 text-lg">Net Salary</span>
                                                <span className="font-bold text-blue-600 text-2xl">₹{currentMonthSalary.netSalary.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Advances */}
                                    {advances.length > 0 && (
                                        <div className="bg-white rounded-xl shadow-lg p-6">
                                            <h3 className="text-xl font-bold text-gray-800 mb-6">Salary Advances</h3>

                                            <div className="space-y-3">
                                                {advances.map((advance) => (
                                                    <div
                                                        key={advance.id}
                                                        className="flex justify-between items-center p-4 bg-red-50 rounded-lg"
                                                    >
                                                        <div>
                                                            <p className="font-medium text-gray-800">
                                                                {new Date(advance.advance_date).toLocaleDateString('en-US', {
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    year: 'numeric'
                                                                })}
                                                            </p>
                                                            {advance.reason && (
                                                                <p className="text-sm text-gray-600">{advance.reason}</p>
                                                            )}
                                                        </div>
                                                        <span className="text-red-600 font-semibold">₹{parseFloat(advance.amount).toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-12 text-gray-600">No salary data available</div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default StaffPortal;