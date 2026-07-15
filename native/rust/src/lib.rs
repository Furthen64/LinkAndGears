//! Ownership-safe Rust boundary for the C-compatible Box3D adapter.

use std::ffi::c_void;

#[repr(C)]
pub struct BodyState {
    pub id: u64,
    pub x: f64,
    pub y: f64,
    pub angle: f64,
    pub vx: f64,
    pub vy: f64,
    pub angular_velocity: f64,
}

#[repr(C)]
struct LagWorld {
    _private: [u8; 0],
}

unsafe extern "C" {
    fn lag_world_create(gravity_x: f64, gravity_y: f64) -> *mut LagWorld;
    fn lag_world_destroy(world: *mut LagWorld);
    fn lag_world_step(world: *mut LagWorld, dt: f64, solver_iterations: i32) -> i32;
}

pub struct World {
    raw: *mut LagWorld,
}

impl World {
    pub fn new(gravity_x: f64, gravity_y: f64) -> Option<Self> {
        let raw = unsafe { lag_world_create(gravity_x, gravity_y) };
        (!raw.is_null()).then_some(Self { raw })
    }

    pub fn step(&mut self, dt: f64, solver_iterations: i32) -> Result<(), i32> {
        let result = unsafe { lag_world_step(self.raw, dt, solver_iterations) };
        (result == 0).then_some(()).ok_or(result)
    }
}

impl Drop for World {
    fn drop(&mut self) {
        unsafe { lag_world_destroy(self.raw) };
    }
}

unsafe impl Send for World {}

#[no_mangle]
pub extern "C" fn lag_rust_abi_version() -> u32 {
    1
}

#[allow(dead_code)]
fn opaque_pointer_size() -> usize {
    std::mem::size_of::<*mut c_void>()
}
